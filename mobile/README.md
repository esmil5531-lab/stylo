# ستايلو — تطبيق الجوال

**كل ستايل في مكان واحد**

تطبيق Stylo للجوال، مبني على **Expo SDK 57** (React Native 0.86) مع Expo Router، باللغة العربية واتجاه RTL افتراضياً.

> قواعد المشروع الكاملة في [`../CLAUDE.md`](../CLAUDE.md).

## المتطلبات

- Node.js 20 أو أحدث (تم الاختبار على 22)
- npm
- للتجربة على الجهاز: تطبيق **Expo Go** المتوافق مع SDK 57، أو development build

## التثبيت والتشغيل

```bash
cd mobile
npm install
```

```bash
npx expo start
```

ثم:
- امسح رمز QR بتطبيق Expo Go (أندرويد) أو الكاميرا (iOS)
- أو اضغط `a` لمحاكي أندرويد، `i` لمحاكي iOS، `w` للمتصفح

تشغيل نسخة الويب مباشرة:

```bash
npm run web
```

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm start` | تشغيل خادم التطوير (Metro) |
| `npm run android` / `npm run ios` / `npm run web` | التشغيل على منصة محددة |
| `npm run typecheck` | فحص أنواع TypeScript |
| `npm run lint` | فحص ESLint |
| `npx expo install <pkg>` | إضافة مكتبة بإصدار متوافق مع SDK 57 (لا تستخدم `npm install <pkg>`) |

إذا كان الاتصال بـ `api.expo.dev` محجوباً (بيئات معزولة)، أضف `EXPO_OFFLINE=1` قبل أوامر `expo`.

## العربية و RTL

- **أندرويد / iOS:** إضافة `expo-localization` في `app.json` (`supportsRTL` و `forcesRTL`) تجعل التطبيق RTL من أول تشغيل. يلزم إعادة بناء التطبيق الأصلي (prebuild / development build) بعد تغيير هذه الإعدادات.
- **الويب:** `src/app/+html.tsx` يضبط `<html lang="ar" dir="rtl">`.
- الخط: **Cairo** يُحمَّل في `src/app/_layout.tsx`؛ استخدم `fonts.*` من `@/theme` بدلاً من `fontWeight`.
- لا تستخدم `left/right` في التنسيق؛ استخدم `start/end` واترك محاذاة النص طبيعية.
- جميع النصوص في `src/i18n/ar.ts`.

## هيكل المجلدات

```
src/
├── app/            # الشاشات (Expo Router) — كل ملف = شاشة
│   ├── _layout.tsx # التخطيط الجذري، الخطوط، RTL
│   ├── +html.tsx   # قالب HTML للويب (lang/dir)
│   ├── index.tsx   # الرئيسية
│   └── orders.tsx  # طلباتي (حالات الطلب الستة)
├── components/     # مكونات مشتركة
├── constants/      # الهوية، حالات الطلب
├── i18n/           # النصوص العربية وإعداد RTL
└── theme/          # الألوان، المسافات، الخطوط
```

## حالات الطلب

ستّ حالات مطابقة لـ `order_status` في قاعدة البيانات (`database/migrations/0001_init.sql`)، ومعرَّفة في `src/constants/orderStatus.ts`:

قيد الانتظار ← مؤكد ← قيد التجهيز ← تم الشحن ← تم التسليم، ويمكن الإلغاء (ملغي) قبل الشحن.

## ملاحظات

- مجلدا `ios/` و `android/` يُولَّدان تلقائياً ولا يُرفعان إلى المستودع.
- بيانات الشاشات حالياً تجريبية ثابتة إلى حين بناء طبقة الـ API.
