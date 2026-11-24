import { useRef, useState, type DragEvent } from 'react';

import { errorMessage, uploadImage, type UploadPurpose } from '@/api/client';
import { IMAGE_ACCEPT, isImageUrl, mediaVariant } from '@/lib/media';

import { Icon, Spinner } from './ui';

/**
 * Photo picker for the back office: choose a file or drop it, the API checks it, removes its
 * metadata and stores three sizes. A link (https://…) can still be pasted instead.
 */

function useUploader(purpose: UploadPurpose) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState<string | null>(null);
  async function run(files: File[], onDone: (url: string) => void) {
    setError(null);
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError('اختاري ملف صورة (JPG أو PNG أو WebP)');
        continue;
      }
      setBusy((n) => n + 1);
      try {
        onDone((await uploadImage(file, purpose)).url);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }
  return { busy: busy > 0, error, setError, run };
}

function dropFiles(e: DragEvent): File[] {
  e.preventDefault();
  return Array.from(e.dataTransfer.files);
}

function LinkInput({ onAdd, onCancel }: { onAdd: (url: string) => void; onCancel: () => void }) {
  const [v, setV] = useState('');
  const ok = isImageUrl(v.trim());
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <input className="input" dir="ltr" autoFocus placeholder="https://…" value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" className="btn btn-primary btn-sm" disabled={!ok} onClick={() => onAdd(v.trim())}>
        إضافة
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
        إلغاء
      </button>
    </div>
  );
}

/** One photo (banner, look cover, category tile). */
export function ImageUpload({
  value,
  onChange,
  purpose,
  shape = 'wide',
  hint,
}: {
  value: string;
  onChange: (url: string) => void;
  purpose: UploadPurpose;
  shape?: 'wide' | 'square' | 'portrait';
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const up = useUploader(purpose);
  const [link, setLink] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <div className="upload">
      <div
        className={`upload-box upload-${shape}${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          void up.run(dropFiles(e).slice(0, 1), onChange);
        }}
      >
        {value ? (
          <img src={mediaVariant(value, 800)} alt="" />
        ) : (
          <button type="button" className="upload-empty" onClick={() => input.current?.click()} disabled={up.busy}>
            <Icon name="plus" size={22} />
            <span>اختاري صورة أو اسحبيها هنا</span>
            {hint && <span className="upload-hint">{hint}</span>}
          </button>
        )}
        {up.busy && (
          <div className="upload-busy">
            <Spinner />
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void up.run(Array.from(e.target.files ?? []).slice(0, 1), onChange);
          e.target.value = '';
        }}
      />
      {link ? (
        <LinkInput
          onAdd={(u) => {
            onChange(u);
            setLink(false);
          }}
          onCancel={() => setLink(false)}
        />
      ) : (
        <div className="row upload-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={up.busy}>
            {value ? 'تغيير الصورة' : 'رفع صورة'}
          </button>
          {value && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>
              إزالة
            </button>
          )}
          <button type="button" className="link-btn" onClick={() => setLink(true)}>
            أو لصق رابط
          </button>
        </div>
      )}
      {up.error && <div className="field-error">{up.error}</div>}
    </div>
  );
}

/** Product photos: up to `max`, the first one is the main photo; reorder with ▶◀. */
export function ImageGallery({
  value,
  onChange,
  max = 8,
}: {
  value: string[];
  onChange: (next: string[] | ((prev: string[]) => string[])) => void;
  max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const up = useUploader('product');
  const [link, setLink] = useState(false);
  const [over, setOver] = useState(false);
  const room = max - value.length;

  const add = (url: string) => onChange((l) => (l.length < max && !l.includes(url) ? [...l, url] : l));
  const move = (i: number, d: -1 | 1) =>
    onChange((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  function pick(files: File[]) {
    if (files.length > room) up.setError(`يمكن إضافة ${max} صور كحد أقصى`);
    void up.run(files.slice(0, Math.max(room, 0)), add);
  }

  return (
    <div className="upload">
      <div
        className={`gallery${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          pick(dropFiles(e));
        }}
      >
        {value.map((url, i) => (
          <figure key={url} className="gallery-item">
            <img src={mediaVariant(url, 320)} alt="" />
            {i === 0 && <span className="gallery-main">الرئيسية</span>}
            <div className="gallery-tools">
              <button type="button" aria-label="تقديم" disabled={i === 0} onClick={() => move(i, -1)}>
                ▶
              </button>
              <button type="button" aria-label="تأخير" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                ◀
              </button>
              <button type="button" aria-label="حذف الصورة" onClick={() => onChange((l) => l.filter((u) => u !== url))}>
                <Icon name="x" size={14} />
              </button>
            </div>
          </figure>
        ))}
        {room > 0 && (
          <button type="button" className="gallery-add" onClick={() => input.current?.click()} disabled={up.busy}>
            {up.busy ? <Spinner /> : <Icon name="plus" size={22} />}
            <span>{up.busy ? 'جارٍ الرفع…' : 'إضافة صور'}</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          pick(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {link ? (
        <LinkInput
          onAdd={(u) => {
            add(u);
            setLink(false);
          }}
          onCancel={() => setLink(false)}
        />
      ) : (
        room > 0 && (
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setLink(true)}>
            أو لصق رابط صورة
          </button>
        )
      )}
      {up.error && <div className="field-error">{up.error}</div>}
    </div>
  );
}
