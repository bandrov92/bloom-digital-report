/**
 * @file test-keys.js — answer keys, outcomes, feedback and review screens for
 * the final test (sec. 21–24). Loaded only after an attempt is submitted.
 *
 * Limit (documented in docs/implementation-log.md): this is a public static
 * site, so the file can be read by anyone who opens it directly. Keeping it
 * separate only stops the keys from appearing in the page before submission.
 */
'use strict';

(function (root, factory) {
  const keys = factory();
  if (typeof module === 'object' && module.exports) module.exports = keys;
  else root.BloomTestKeys = keys;
})(typeof self !== 'undefined' ? self : this, () => {
  const key = (answer, outcome, feedback, review) => Object.freeze({ answer, outcome, feedback, review });

  const KEYS = Object.freeze({
    A1: key('b', 'ن1', 'شكل المنتج لا يحدد العملية المعرفية.', '05'),
    A2: key('c', 'ن1', 'يتطلب التقييم هنا حكمًا مؤسسًا على معايير.', '07'),
    A3: key('a', 'ن2', 'توضح الصياغة شروط الأداء والدليل ومعيار الحكم.', '09'),
    A4: key('b', 'ن3', 'تختار الوظيفة لخدمة أداء محدد.', '08'),
    A5: key('c', 'ن4', 'يغير التعديل الطلب المعرفي والدليل، لا الشكل وحده.', '14'),
    A6: key('a', 'ن5', 'الدليل يحتاج حكمًا وتعليلًا متسقين مع الهدف.', '19'),
    A7: key('b', 'ن5', 'تحدد النقص والفعل المطلوب لمعالجته.', '19'),
    A8: key('c', 'ن6', 'الملاحظة المحلية تدعم مراجعة محدودة ولا تثبت تعميمًا.', '28'),
    A9: key('a', 'ن3', 'الوظيفة التعليمية هي مرجع البديل.', '11'),
    A10: key('b', 'ن7', 'يتيح السجل المقارنة والعمل على حاجة تالية.', '27'),
    B1: key('c', 'ن1', 'الوصف يطلب استخدام إجراء معروف في حالة مناسبة.', '06'),
    B2: key('a', 'ن1', 'المطلوب تفكيك العلاقات وتفسيرها.', '07'),
    B3: key('b', 'ن2', 'يضيف أداءً وشروطًا ومعيارًا يمكن مراجعته.', '17'),
    B4: key('c', 'ن3', 'الملاءمة تتصل بالمهمة وسياق الاستخدام.', '08'),
    B5: key('a', 'ن4', 'تتطلب بناء حل متسق واختباره بدل النسخ.', '15'),
    B6: key('b', 'ن5', 'الدليل المقترح يتسق مع العملية المستهدفة.', '19'),
    B7: key('c', 'ن5', 'توضح الرسالة ما ينقص وكيف يستكمل.', '19'),
    B8: key('a', 'ن6', 'توثيق نوع التجربة يمنع ادعاء أدلة غير موجودة.', '28'),
    B9: key('b', 'ن3', 'تتبع الوسيلة متطلبات الاستجابة وإتاحتها.', '11'),
    B10: key('c', 'ن7', 'يصل السجل قرار التحسين بشواهده.', '28'),
  });

  return Object.freeze({ KEYS });
});
