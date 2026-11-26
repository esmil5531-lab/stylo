import { useState } from 'react';

import { useBlockCustomer } from '@/api/hooks';
import type { AdminOrderDetail } from '@/api/types';
import { formatDateTime } from '@/lib/format';

import { Count } from './inputs';
import { useCan } from './Layout';
import { ErrorAlert, Field, Modal } from './ui';

/**
 * «سجل الزبون» on the order page: deliveries, failed deliveries by reason, a warning from
 * REFUSAL_WARN_AT refusals (refused + no answer), and «حظر الزبون» (customers.block).
 */
export function CustomerRecordCard({ order }: { order: AdminOrderDetail }) {
  const rec = order.customerRecord;
  const canBlock = useCan('customers.block');
  const block = useBlockCustomer(order.id, order.customer.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <section className={`card card-pad stack${rec.warn || rec.blocked ? ' customer-warn' : ''}`}>
      <div className="card-title" style={{ margin: 0 }}>
        سجل الزبون
      </div>
      {rec.blocked && (
        <div className="alert alert-error">
          محظور منذ {formatDateTime(rec.blocked.at)}
          {rec.blocked.by ? ` (${rec.blocked.by})` : ''}: {rec.blocked.reason}. لا يستطيع إتمام طلبات جديدة.
        </div>
      )}
      {!rec.blocked && rec.warn && (
        <div className="alert alert-warn">
          تنبيه: تعذّر التسليم لهذا الزبون <Count value={rec.refusals} /> مرات (رفض الاستلام أو لم يرد).
        </div>
      )}
      <dl className="kv">
        <dt>طلبات سُلّمت</dt>
        <dd>
          <Count value={rec.delivered} />
        </dd>
        <dt>رفض الاستلام</dt>
        <dd>
          <Count value={rec.failed.refused} />
        </dd>
        <dt>لا يرد</dt>
        <dd>
          <Count value={rec.failed.noAnswer} />
        </dd>
        <dt>عنوان غير صحيح / تأجيل</dt>
        <dd>
          <Count value={rec.failed.wrongAddress} /> / <Count value={rec.failed.postponed} />
        </dd>
        <dt>أُلغيت قبل الشحن</dt>
        <dd>
          <Count value={rec.cancelledBeforeShipping} />
        </dd>
      </dl>
      {canBlock &&
        (rec.blocked ? (
          <button className="btn btn-outline btn-sm" disabled={block.isPending} onClick={() => block.mutate({ blocked: false })}>
            إلغاء الحظر
          </button>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>
            حظر الزبون
          </button>
        ))}
      <ErrorAlert error={block.error} />
      {open && (
        <Modal
          title={`حظر ${order.customer.name}`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>
                تراجع
              </button>
              <button
                className="btn btn-danger"
                disabled={!reason.trim() || block.isPending}
                onClick={() => block.mutate({ blocked: true, reason: reason.trim() }, { onSuccess: () => setOpen(false) })}
              >
                تأكيد الحظر
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            يبقى التصفح متاحاً له، لكنه لا يستطيع إتمام أي طلب جديد حتى يُلغى الحظر. طلباته الحالية لا تتأثر.
          </p>
          <Field label="سبب الحظر" required hint="يظهر لفريق ستايلو فقط">
            <input className="input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      )}
    </section>
  );
}
