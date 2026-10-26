/**
 * @file course-data.js — course structure, closed items and rule tables.
 *
 * Single place to update content that the logic depends on: the 20 completion
 * elements, the recommended path, the diagnostic items, the practice checks,
 * the self-review rubric and the system messages. Screen prose lives in
 * learn/index.html; final-test items live in js/test-forms.js and their keys in
 * js/test-keys.js (both loaded on demand).
 *
 * Source: "وثيقة التصميم التعليمي والسيناريو التفصيلي" v0.1 (2026-10-23).
 * Section numbers in comments refer to that document.
 * Written with Claude Code (AI-assisted); texts are copied from the document.
 */
'use strict';

(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.BloomData = data;
})(typeof self !== 'undefined' ? self : this, () => {
  /** Content release shown in records; bump when requirements change (sec. 28). */
  const CONTENT_VERSION = '0.1';

  /** Pass rule (approved decision). Both conditions are required. */
  const PASS_RULE = Object.freeze({ contentThreshold: 80, scoreThreshold: 60 });

  /**
   * Final-test settings (sec. 19). firstForm 'A' approved by the owner on
   * 2026-10-23; form B stays authored for trials or a later retake policy.
   * shuffleOptions follows the document ("ترتيب بدائل الإجابة قابل للتغيير").
   */
  const TEST_CONFIG = Object.freeze({
    forms: Object.freeze(['A', 'B']),
    firstForm: 'A',
    itemsPerForm: 10,
    pointsPerItem: 10,
    totalPoints: 100,
    shuffleOptions: true,
  });

  /**
   * The 20 equally weighted completion elements (sec. 27). `screen` is where the
   * element is completed; `condition` is shown to the learner on the dashboard.
   */
  const ELEMENTS = Object.freeze([
    { id: 't01', screen: '02', condition: 'الإجابة عن بنود التشخيص وفتح تقريرها' },
    { id: 't02', screen: '03', condition: 'تسجيل بطاقة الحاجة بحقولها المطلوبة' },
    { id: 't03', screen: '05', condition: 'الوصول إلى الإجابة الصحيحة في الحكم وسببه' },
    { id: 't04', screen: '06', condition: 'تصحيح التصنيفات الثلاثة' },
    { id: 't05', screen: '07', condition: 'تصحيح المطابقة وتسجيل إعادة الصياغة ومراجعتها' },
    { id: 't06', screen: '08', condition: 'الاختيار الصحيح وإدخال الوسيلة وبديلها وتأكيد المراجعة' },
    { id: 't07', screen: '09', condition: 'صياغة الهدف وتأكيد مراجعته بالمحكات' },
    { id: 't08', screen: '10', condition: 'اختيار الأولوية والخطوة التالية وشرط العودة' },
    { id: 't09', screen: '13', condition: 'الاختيار الصحيح وربط جزأيه بالمعيارين' },
    { id: 't10', screen: '14', condition: 'كتابة النسخة ومراجعة المحكات ومعالجة النقص أو تعليله' },
    { id: 't11', screen: '15', condition: 'اكتمال حقول المهمة وتسجيل المراجعة الذاتية' },
    { id: 't12', screen: '16', condition: 'المقارنة بين النسختين وتسجيل التفسير' },
    { id: 't13', screen: '17', condition: 'استكمال حقول الهدف والسياق وتأكيد مراجعتها' },
    { id: 't14', screen: '18', condition: 'إدخال المهمة والدليل والوسيلة ومبررها ومراجعة المعاينة' },
    { id: 't15', screen: '19', condition: 'إدخال المحك والدليل ورسالة العلاج والمحاولة التالية وتأكيد المقارنة' },
    { id: 't16', screen: '20', condition: 'المراجعة الذاتية بأدلتها وحفظ نسخة من المشروع' },
    { id: 't17', screen: '24', condition: 'مراجعة تقرير الاختبار وتسجيل استنتاج وخطوة تطبيق' },
    { id: 't18', screen: '25', condition: 'بطاقة مصدر مستوفية للحقول اللازمة' },
    { id: 't19', screen: '26', condition: 'الحكم الصحيح وتسجيل استخدام المصدر وحده ومراجعتهما' },
    { id: 't20', screen: '27', condition: 'خطة تجربة قابلة للتنفيذ أو عائق موضح وخطوة حله' },
  ].map(Object.freeze));

  /** Recommended order (sec. 4): overview, initial plan, Bloom map, practice, template, test, return. */
  const RECOMMENDED_PATH = Object.freeze([
    '01', '02', '03', '04', '09', '10', '05', '06', '07', '08', '11', '12',
    '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
    '25', '26', '27', '28',
  ]);

  /** Screen-specific "next" targets where the scenario names one. */
  const NEXT_OVERRIDES = Object.freeze({ '04': '09', '10': '05', '12': '13', '20': '21', '28': '03' });

  /** Shared answer scale for self-review questions. Never converted into a score. */
  const REVIEW_SCALE = Object.freeze([
    { id: 'yes', text: 'نعم' },
    { id: 'partly', text: 'جزئيًا' },
    { id: 'notyet', text: 'ليس بعد' },
  ]);

  const LEVELS = Object.freeze([
    { id: 'remember', text: 'التذكر' },
    { id: 'understand', text: 'الفهم' },
    { id: 'apply', text: 'التطبيق' },
    { id: 'analyze', text: 'التحليل' },
    { id: 'evaluate', text: 'التقييم' },
    { id: 'create', text: 'الإبداع' },
  ]);

  /** Example rows of the six processes (sec. 9); reused as hints after a wrong choice. */
  const PROCESS_EXAMPLES = Object.freeze({
    remember: 'مثال التذكر: «استرجع قواعد توزيع الأدوار التي درستها دون الرجوع إلى النص».',
    understand: 'مثال الفهم: «اشرح بكلماتك معنى توزيع المسؤوليات، ومثل له بحالة بسيطة».',
    apply: 'مثال التطبيق: «باستخدام إجراء توزيع الأدوار الذي تعلمته، وزع الأدوار على مهمة مشابهة موصوفة أمامك».',
    analyze: 'مثال التحليل: «افحص سجل فريق افتراضي وحدد العلاقات بين تداخل المسؤوليات وتأخر تسليم المهمات، مستندًا إلى شواهد السجل».',
    evaluate: 'مثال التقييم: «احكم على خطتين وفق وضوح المسؤوليات وقابلية التتبع، وادعم حكمك بمعلومات من الخطتين».',
    create: 'مثال الإبداع: «صمم خطة جديدة لتنظيم مهمة لها قيود محددة، واجمع عناصرها في حل متسق ثم اختبره وعدله».',
  });

  /**
   * Diagnostic items (sec. 5, screen 02). Not part of the pass decision.
   * `review` lists the screens the learner is sent to after a wrong answer.
   */
  const DIAGNOSTIC = Object.freeze([
    {
      id: 'q1', stem: 'نسخ تعريف جاهز إلى ملصق رقمي يثبت أن المهمة إبداعية.', hint: 'اختر صحيح أو غير صحيح.',
      options: [{ id: 't', text: 'صحيح' }, { id: 'f', text: 'غير صحيح' }],
      answer: 'f', explain: 'غير صحيح؛ إنتاج ملف رقمي لا يكفي للحكم على العملية العقلية.', review: ['05', '08'],
    },
    {
      id: 'q2', stem: 'أي هدف أوضح للتقويم؟',
      options: [
        { id: 'a', text: 'أن يفهم المتعلم جودة المصدر.' },
        { id: 'b', text: 'أن يختار بين مصدرين ويبرر اختياره بملاءمة كل منهما للمهمة وإمكانية تتبع معلوماته.' },
      ],
      answer: 'b', explain: 'الصياغة الثانية؛ لأنها تحدد الأداء ودليل الحكم.', review: ['09', '17'],
    },
    {
      id: 'q3', stem: 'أيهما يبدأ به تصميم المهمة؟',
      options: [{ id: 'a', text: 'اسم الأداة.' }, { id: 'b', text: 'ما سيفعله المتعلم والدليل الذي سيقدمه.' }],
      answer: 'b', explain: 'ما سيفعله المتعلم والدليل؛ اختيار الوظيفة الرقمية يتبع متطلبات المهمة.', review: ['08', '15'],
    },
    {
      id: 'q4', stem: 'الهدف هو تقويم حلين. أي دليل أنسب؟',
      options: [{ id: 'a', text: 'ذكر اسميهما.' }, { id: 'b', text: 'حكم معلل وفق محكات معلنة.' }],
      answer: 'b', explain: 'الحكم المعلل وفق محكات؛ تسمية الحلين لا تكشف تحقق الهدف.', review: ['19'],
    },
    {
      id: 'q5', stem: 'أي رسالة تساعد على تحسين الاستجابة؟',
      options: [
        { id: 'a', text: 'خطأ، حاول ثانية.' },
        { id: 'b', text: 'ذكرت اختيارك ولم تذكر المعيار؛ أضف معيارًا وطبقه على الخيارين.' },
      ],
      answer: 'b', explain: 'الرسالة الثانية؛ لأنها تربط النقص بإجراء تصحيحي.', review: ['19', '24'],
    },
    {
      id: 'q6', stem: 'تجربة ناجحة مرة واحدة تثبت نجاح المهمة مع جميع الصفوف.', hint: 'اختر صحيح أو غير صحيح.',
      options: [{ id: 't', text: 'صحيح' }, { id: 'f', text: 'غير صحيح' }],
      answer: 'f', explain: 'غير صحيح؛ يوثق سياق التجربة وحدود ما تدل عليه.', review: ['27', '28'],
    },
  ].map(Object.freeze));

  /**
   * Practice checks rendered into [data-check="id"]. Every part must be correct.
   * After a check, correct parts are locked and only the wrong ones reopen.
   * `wrongBy` maps a wrong option id to a targeted message (sec. 10: analysis vs evaluation).
   * `feedback.wrongHtml` is trusted, authored markup (never learner input).
   */
  const CHECKS = Object.freeze({
    s05: {
      element: 't03',
      parts: [
        { id: 'judge', type: 'choice', prompt: 'هل يكفي شكل الملصق للحكم بأن المهمتين إبداع؟',
          options: [{ id: 'yes', text: 'نعم' }, { id: 'no', text: 'لا' }], answer: 'no' },
        { id: 'reason', type: 'choice', prompt: 'ما الذي يحدد الحكم؟',
          options: [{ id: 'file', text: 'شكل الملف' }, { id: 'act', text: 'ما يفعله المتعلم لإنتاجه' }], answer: 'act' },
      ],
      feedback: {
        correct: 'حلل هل يسترجع المتعلم أو يفسر أو يطبق أو يحلل أو يحكم أو ينتج حلًا جديدًا. اسم الأداة لا يحسم ذلك.',
        wrongHtml: 'انظر إلى الفعل في كل مهمة: في الأولى <mark>ينقل</mark> المتعلم تعريفات جاهزة، وفي الثانية <mark>يبني</mark> اقتراحًا جديدًا وفق قيود <mark>ويوضح</mark> مبرراته. الملصق واحد، والعملية مختلفة.',
      },
    },
    s06: {
      element: 't04',
      parts: [
        { id: 'm1', type: 'select', prompt: 'استرجاع قواعد عمل سبق تعلمها', options: LEVELS, answer: 'remember', hint: PROCESS_EXAMPLES.remember },
        { id: 'm2', type: 'select', prompt: 'شرح القواعد بكلماتك مع مثال', options: LEVELS, answer: 'understand', hint: PROCESS_EXAMPLES.understand },
        { id: 'm3', type: 'select', prompt: 'استخدام إجراء توزيع أدوار سبق تعلمه لتنظيم مهمة مشابهة', options: LEVELS, answer: 'apply', hint: PROCESS_EXAMPLES.apply },
      ],
      feedback: {
        correct: 'الترتيب: التذكر، الفهم، التطبيق. التطبيق هنا تنفيذ إجراء معروف في موقف مناسب، أما شرح معناه فأقرب إلى الفهم.',
        wrong: 'أعد اختيار البند المختلف فقط؛ تجد تحته مثالًا نصيًا مساعدًا.',
      },
    },
    s07: {
      element: 't05',
      parts: [
        { id: 'm1', type: 'select', prompt: 'بيان العلاقة بين أجزاء سجل', options: LEVELS.slice(3), answer: 'analyze', hint: PROCESS_EXAMPLES.analyze,
          wrongBy: { evaluate: 'تفسير العلاقات يختلف عن الحكم وفق محك؛ حدد أيهما يطلبه النص.' } },
        { id: 'm2', type: 'select', prompt: 'الحكم على بديلين وفق محكات', options: LEVELS.slice(3), answer: 'evaluate', hint: PROCESS_EXAMPLES.evaluate,
          wrongBy: { analyze: 'تفسير العلاقات يختلف عن الحكم وفق محك؛ حدد أيهما يطلبه النص.' } },
        { id: 'm3', type: 'select', prompt: 'إنتاج خطة جديدة تستجيب لقيود', options: LEVELS.slice(3), answer: 'create', hint: PROCESS_EXAMPLES.create },
      ],
      feedback: {
        correct: 'التحليل ثم التقييم ثم الإبداع. يحدد نوع الدليل المطلوب العملية الغالبة.',
        wrong: 'أعد اختيار البند المختلف فقط.',
      },
    },
    s08: {
      element: 't06',
      parts: [
        { id: 'fn', type: 'choice', prompt: 'أي وظيفة تخدم المهمة أكثر؟',
          options: [{ id: 'decor', text: 'تزيين العنوان فقط' }, { id: 'compare', text: 'عرض البديلين مع معايير المقارنة وشواهد الحكم' }], answer: 'compare' },
      ],
      feedback: {
        correct: 'اخترت الوظيفة التي تُظهر الدليل المطلوب: المقارنة والمعايير والشواهد.',
        wrong: 'ما الدليل الذي سيمكنك من الحكم على جودة التفكير؟ اربط اختيارك به.',
      },
    },
    s13: {
      element: 't09',
      parts: [
        { id: 'pick', type: 'choice', prompt: 'أي استجابة تكشف تقويمًا وفق محكات؟',
          options: [
            { id: 'a', text: 'الخطة أ أجمل.' },
            { id: 'b', text: 'الخطة أ أوضح في المسؤوليات والخطة ب أوضح في التتبع، وتحتاج كل منهما إلى استكمال الجانب الآخر.' },
            { id: 'c', text: 'أسماء الخطتين أ وب.' },
          ], answer: 'b' },
      ],
      feedback: {
        correct: 'ربطت الاستجابة الحكم بمعلومات محددة من الخطتين. الشكل أو تكرار الأسماء لا يقدم هذا الدليل.',
        wrongHtml: 'معيارا الحكم هما <mark>وضوح المسؤوليات</mark> و<mark>قابلية تتبع الإنجاز</mark>. ابحث عن الاستجابة التي تذكر ما تحقق في كل خطة وفق كل معيار.',
      },
    },
    // Second half of the screen 13 check (part ب): linking each part of the response to its criterion.
    s13b: {
      element: 't09',
      parts: [
        { id: 'link1', type: 'select', prompt: 'الجزء الأول: «الخطة أ أوضح في المسؤوليات» يستند إلى معيار',
          options: [{ id: 'resp', text: 'وضوح المسؤوليات' }, { id: 'track', text: 'قابلية تتبع الإنجاز' }], answer: 'resp' },
        { id: 'link2', type: 'select', prompt: 'الجزء الثاني: «الخطة ب أوضح في التتبع» يستند إلى معيار',
          options: [{ id: 'resp', text: 'وضوح المسؤوليات' }, { id: 'track', text: 'قابلية تتبع الإنجاز' }], answer: 'track' },
      ],
      feedback: {
        correct: 'ربطت كل جزء من الاستجابة بمعياره؛ بهذا يصبح الحكم قابلًا للتتبع.',
        wrongHtml: 'معيارا الحكم هما <mark>وضوح المسؤوليات</mark> و<mark>قابلية تتبع الإنجاز</mark>. اربط كل جزء من الاستجابة بالمعيار الذي يصفه.',
      },
    },
    s26: {
      element: 't19',
      parts: [
        { id: 'judge', type: 'choice', prompt: 'ما الحكم الأدق؟',
          options: [{ id: 'context', text: 'يمكن الاستفادة مع مراعاة اختلاف السياق' }, { id: 'auto', text: 'تثبت الدراسة تلقائيًا نجاح برنامجي' }], answer: 'context' },
      ],
      feedback: {
        correct: 'حدد العينة والمهمة والنتيجة قبل نقل الاستنتاج إلى سياقك.',
        wrong: 'دراسة على طلبة مرحلة محددة لا تثبت وحدها نجاح تدريب لمعلمين. حدد العينة والمهمة والنتيجة قبل نقل الاستنتاج.',
      },
    },
  });

  /** Project self-review rubric (sec. 18). Not part of the test score. */
  const RUBRIC = Object.freeze([
    { id: 'goal', name: 'الهدف', met: 'أداء وشروط ومعيار يمكن ملاحظتها.', improve: 'الأداء ظاهر لكن الشرط أو معيار الحكم غامض.', absent: 'صياغة عامة لا تحدد ما سيقدمه المتعلم.' },
    { id: 'alignment', name: 'المواءمة المعرفية', met: 'الهدف والتعليمات والدليل تتطلب العملية نفسها.', improve: 'جزء من النشاط يخدم الهدف وجزء لا يقدم دليلًا عليه.', absent: 'التصنيف قائم على اسم الأداة أو شكل الملف.' },
    { id: 'clarity', name: 'وضوح المهمة', met: 'تعليمات ومصادر ومخرج واضح يستطيع المتعلم تتبعها.', improve: 'توجد خطوة أو معلومة لازمة لم توضح.', absent: 'لا يمكن تحديد ما سيقدمه المتعلم.' },
    { id: 'digital', name: 'الوظيفة الرقمية', met: 'تخدم الدليل، وملاءمتها للسياق مبررة، ولها بديل ممكن.', improve: 'الوظيفة مفيدة لكن الملاءمة أو البديل غير محدد.', absent: 'اختيار الأداة بلا صلة موضحة بالهدف.' },
    { id: 'feedback', name: 'التقويم والعلاج', met: 'محك قابل للملاحظة ورسالة علاج ومحاولة تحقق تالية.', improve: 'يوجد محك أو علاج لكن الرابط بالدليل ناقص.', absent: 'درجة أو مديح عام بلا محك أو خطوة تالية.' },
    { id: 'sources', name: 'تتبع المحتوى', met: 'المصادر معروفة وحدود استعمالها موضحة.', improve: 'مصدر موجود لكن موضع الاستناد أو معلوماته ناقصة.', absent: 'محتوى منقول لا يمكن تتبع مصدره.' },
    { id: 'trial', name: 'قابلية التجريب', met: 'سياق تجربة ودليل مطلوب وطريقة مراجعة محددة.', improve: 'التجربة محددة والدليل أو طريقة المراجعة غامضان.', absent: 'لا توجد طريقة معلنة لاختبار التصميم.' },
  ].map(Object.freeze));

  /** Rubric column labels; "na" needs a reason (sec. 18). */
  const RUBRIC_LEVELS = Object.freeze([
    { id: 'met', text: 'متحقق في الدليل' },
    { id: 'improve', text: 'يحتاج تحسينًا' },
    { id: 'absent', text: 'غير ظاهر' },
    { id: 'na', text: 'لا ينطبق' },
  ]);

  /** Feedback tied to the deficit the learner selects (sec. 15). Never inferred from keywords. */
  const DEFICITS = Object.freeze([
    { id: 'goal', text: 'الهدف غير قابل للملاحظة', message: 'اكتب ما ستشاهده في استجابة المتعلم، ثم راجع صياغتك في الشاشة 09.', link: '09' },
    { id: 'evidence', text: 'الدليل لا يكشف الهدف', message: 'إذا طلب الهدف حكمًا، فأضف محكات وتعليلًا؛ تسمية البدائل وحدها لا تكفي.', link: '19' },
    { id: 'tool', text: 'اختيار الأداة غير مبرر', message: 'حدد الوظيفة التي تحتاجها لإظهار الدليل، ثم ابحث عن وسيلة تحققها.', link: '08' },
    { id: 'copy', text: 'الاستجابة نسخ للمثال', message: 'اختر سياقًا أو قيودًا مختلفة، وأعد بناء المهمة مع تبرير القرارات.', link: '15' },
    { id: 'noclass', text: 'لا تتوفر فرصة صفية', message: 'اختبر وضوح المهمة بمحاكاة موثقة؛ سمها محاكاة وأبق نقلها للصف خطوة لاحقة.', link: '27' },
  ].map(Object.freeze));

  /** Learner-facing system messages (sec. 34 and screen 23). */
  const MESSAGES = Object.freeze({
    saved: 'حُفظت المسودة في هذا المتصفح. يُحتسب استكمال النشاط عند تحقيق متطلباته.',
    saveFailed: 'لم نتمكن من حفظ آخر تعديل. احتفظ بالنص الظاهر، ثم حاول الحفظ مرة أخرى. يمكنك نسخ عملك قبل المغادرة.',
    restored: 'هذه آخر نسخة محفوظة. تابع من هنا أو افتح نسخة سابقة.',
    unsavedExit: 'لديك تعديل لم يحفظ. احفظه قبل المغادرة، أو عد لمواصلة التحرير.',
    passed: 'استوفيت شروط اجتياز الدورة.',
    contentOnly: 'اكتمل شرط المحتوى. يتبقى تحقيق 60 من 100 فأكثر في الاختبار الختامي.',
    scoreOnly: 'تحقق شرط درجة الاختبار. يتبقى استكمال المحتوى حتى 80% على الأقل.',
    selfReviewDone: 'اكتملت مراجعتك الذاتية لهذه النسخة.',
    singleAttempt: 'للاختبار الختامي محاولة مرسلة واحدة في هذه النسخة، وتبقى محاولتك محفوظة كما هي. راجع التقرير وانتقل إلى خطوة التعلم التالية.',
  });

  return Object.freeze({
    CONTENT_VERSION, PASS_RULE, TEST_CONFIG, ELEMENTS, RECOMMENDED_PATH, NEXT_OVERRIDES,
    REVIEW_SCALE, LEVELS, PROCESS_EXAMPLES, DIAGNOSTIC, CHECKS, RUBRIC, RUBRIC_LEVELS, DEFICITS, MESSAGES,
  });
});
