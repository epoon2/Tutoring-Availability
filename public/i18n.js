/*
  LANGUAGES

  What a visitor reads - the header, the toolbar, the request form,
  the log-in dialog, the status lines - in six languages. The choice
  is kept on the device; with none, the browser's language is used
  where it is one of these, else the calendar's own default.

  The owner's tools (the editor, Settings, the request list, the
  version history) stay in English. The names of open and booked time
  come from Settings, in whatever language the owner typed them.

  Loaded before app.js and by the home page, as window.I18N.
*/
(function () {

  var LANGUAGES = {
    en: 'English',
    es: 'Español',
    zh: '中文',
    fr: 'Français',
    ko: '한국어',
    vi: 'Tiếng Việt'
  };

  var LOCALES = {
    en: undefined,
    es: 'es',
    zh: 'zh-CN',
    fr: 'fr',
    ko: 'ko',
    vi: 'vi'
  };

  var STRINGS = {

    en: {
      refresh: 'Refresh',
      request: 'Request a session',
      login: 'Log in',
      theme: 'Switch between light and dark',
      language: 'Language',
      today: 'Today',
      prev_week: 'Previous week',
      next_week: 'Next week',
      grid: 'Grid',
      list: 'List',
      day: 'Day',
      week: 'Week',
      month: 'Month',
      screenshot: 'Screenshot weekly schedule',
      public_view: 'Public view:',
      public_view_text: 'Upcoming available times and anonymized blocked sessions are shown. Times that have already passed are hidden, and private event names and notes are never shown.',
      loading: 'Loading…',
      updated_by: '{owner} last updated the schedule {when}',
      not_saved: '{owner} has not saved any times yet',
      refreshed_now: 'Refreshed just now',
      refreshed_at: 'Refreshed at {time}',
      request_title: 'Request a session',
      request_intro: 'Ask for a time that works for you. Nothing is booked until {owner} confirms it.',
      your_name: 'Your name',
      name_placeholder: 'e.g. John',
      email: 'Email',
      email_hint: 'so {owner} can get back to you',
      phone: 'Phone',
      guardian: 'Parent / guardian',
      optional: 'optional',
      starts: 'Starts',
      ends: 'Ends',
      repeat: 'Repeat',
      no_repeat: 'Does not repeat',
      weekly: 'Weekly',
      format: 'Format',
      select_one: 'Select One',
      online: 'Online',
      in_person: 'In-Person',
      repeat_every: 'Repeat every',
      weeks: 'week(s)',
      repeat_on: 'Repeat on',
      never: 'Never',
      on: 'On',
      after: 'After',
      occurrences: 'occurrences',
      subject: 'Subject',
      outside_hours: 'Outside available hours',
      warning_footer: 'You can still send this request. {owner} will confirm whether the time works.',
      cancel: 'Cancel',
      send_request: 'Send request',
      send_anyway: 'Send Anyway',
      request_sent: 'Request sent. {owner} will confirm it before it appears on the calendar.',
      need_name: 'Please enter your name.',
      need_email: 'Please enter an email address {owner} can reply to.',
      need_subject: 'Please enter the subject.',
      need_format: 'Please choose online or in person.',
      need_times: 'Please choose a start and end time.',
      end_after_start: 'The end time must be after the start time.',
      fill_required: 'Please fill in every required field.',
      login_title: 'Log in',
      password: 'Password',
      keep_signed_in: 'Keep me signed in on this device',
      keep_note: 'for 90 days, or until the password changes',
      forgot: 'Forgot your password?',
      create_account: 'Create an account',
      login_btn: 'Log in',
      login_blank: 'Please enter your email and password.',
      sign_out: 'Sign out',
      my_calendar: 'My calendar',
      missing_title: 'There is no calendar at this address',
      missing_text: 'Check the link you were given, or start a calendar of your own.',
      unpublished_title: 'This calendar is not published yet',
      unpublished_text: 'Its owner still has to confirm their email. Check back soon.',
      go_home: 'Go to the home page',
      wd: [ 'S', 'M', 'T', 'W', 'T', 'F', 'S' ]
    },

    es: {
      refresh: 'Actualizar',
      request: 'Solicitar una sesión',
      login: 'Iniciar sesión',
      theme: 'Cambiar entre claro y oscuro',
      language: 'Idioma',
      today: 'Hoy',
      prev_week: 'Semana anterior',
      next_week: 'Semana siguiente',
      grid: 'Cuadrícula',
      list: 'Lista',
      day: 'Día',
      week: 'Semana',
      month: 'Mes',
      screenshot: 'Captura del horario semanal',
      public_view: 'Vista pública:',
      public_view_text: 'Se muestran los horarios disponibles próximos y las sesiones ocupadas de forma anónima. Los horarios ya pasados se ocultan, y los nombres y notas privados nunca se muestran.',
      loading: 'Cargando…',
      updated_by: '{owner} actualizó el horario {when}',
      not_saved: '{owner} aún no ha guardado ningún horario',
      refreshed_now: 'Actualizado justo ahora',
      refreshed_at: 'Actualizado a las {time}',
      request_title: 'Solicitar una sesión',
      request_intro: 'Pide un horario que te convenga. Nada queda reservado hasta que {owner} lo confirme.',
      your_name: 'Tu nombre',
      name_placeholder: 'p. ej. Juan',
      email: 'Correo electrónico',
      email_hint: 'para que {owner} pueda responderte',
      phone: 'Teléfono',
      guardian: 'Padre, madre o tutor',
      optional: 'opcional',
      starts: 'Empieza',
      ends: 'Termina',
      repeat: 'Repetir',
      no_repeat: 'No se repite',
      weekly: 'Cada semana',
      format: 'Modalidad',
      select_one: 'Elige una',
      online: 'En línea',
      in_person: 'Presencial',
      repeat_every: 'Repetir cada',
      weeks: 'semana(s)',
      repeat_on: 'Repetir los',
      never: 'Nunca',
      on: 'El',
      after: 'Tras',
      occurrences: 'veces',
      subject: 'Materia',
      outside_hours: 'Fuera del horario disponible',
      warning_footer: 'Aun así puedes enviar la solicitud. {owner} confirmará si el horario funciona.',
      cancel: 'Cancelar',
      send_request: 'Enviar solicitud',
      send_anyway: 'Enviar de todos modos',
      request_sent: 'Solicitud enviada. {owner} la confirmará antes de que aparezca en el calendario.',
      need_name: 'Escribe tu nombre.',
      need_email: 'Escribe un correo al que {owner} pueda responder.',
      need_subject: 'Escribe la materia.',
      need_format: 'Elige en línea o presencial.',
      need_times: 'Elige una hora de inicio y de fin.',
      end_after_start: 'La hora de fin debe ser posterior a la de inicio.',
      fill_required: 'Por favor, completa todos los campos obligatorios.',
      login_title: 'Iniciar sesión',
      password: 'Contraseña',
      keep_signed_in: 'Mantener la sesión iniciada en este dispositivo',
      keep_note: 'durante 90 días, o hasta que cambie la contraseña',
      forgot: '¿Olvidaste tu contraseña?',
      create_account: 'Crear una cuenta',
      login_btn: 'Iniciar sesión',
      login_blank: 'Escribe tu correo y tu contraseña.',
      sign_out: 'Cerrar sesión',
      my_calendar: 'Mi calendario',
      missing_title: 'No hay ningún calendario en esta dirección',
      missing_text: 'Revisa el enlace que te dieron, o crea tu propio calendario.',
      unpublished_title: 'Este calendario aún no está publicado',
      unpublished_text: 'Su dueño todavía tiene que confirmar su correo. Vuelve pronto.',
      go_home: 'Ir a la página principal',
      wd: [ 'D', 'L', 'M', 'X', 'J', 'V', 'S' ]
    },

    zh: {
      refresh: '刷新',
      request: '预约时段',
      login: '登录',
      theme: '切换浅色/深色',
      language: '语言',
      today: '今天',
      prev_week: '上一周',
      next_week: '下一周',
      grid: '网格',
      list: '列表',
      day: '日',
      week: '周',
      month: '月',
      screenshot: '截取本周日程',
      public_view: '公开视图：',
      public_view_text: '显示即将到来的可预约时段和匿名的已占用时段。已过去的时段不再显示，私人事件名称和备注绝不会显示。',
      loading: '加载中…',
      updated_by: '{owner} 最近更新日程：{when}',
      not_saved: '{owner} 尚未保存任何时段',
      refreshed_now: '刚刚刷新',
      refreshed_at: '刷新于 {time}',
      request_title: '预约时段',
      request_intro: '选择一个适合你的时间。在 {owner} 确认之前不会预定。',
      your_name: '你的姓名',
      name_placeholder: '例如：小明',
      email: '电子邮箱',
      email_hint: '以便 {owner} 回复你',
      phone: '电话',
      guardian: '家长 / 监护人',
      optional: '选填',
      starts: '开始',
      ends: '结束',
      repeat: '重复',
      no_repeat: '不重复',
      weekly: '每周',
      format: '方式',
      select_one: '请选择',
      online: '线上',
      in_person: '线下',
      repeat_every: '每隔',
      weeks: '周',
      repeat_on: '重复于',
      never: '永不',
      on: '于',
      after: '共',
      occurrences: '次',
      subject: '科目',
      outside_hours: '不在可预约时段内',
      warning_footer: '你仍然可以发送此请求。{owner} 会确认该时间是否可行。',
      cancel: '取消',
      send_request: '发送请求',
      send_anyway: '仍然发送',
      request_sent: '请求已发送。{owner} 确认后才会显示在日历上。',
      need_name: '请输入你的姓名。',
      need_email: '请输入一个 {owner} 可以回复的邮箱。',
      need_subject: '请输入科目。',
      need_format: '请选择线上或线下。',
      need_times: '请选择开始和结束时间。',
      end_after_start: '结束时间必须晚于开始时间。',
      fill_required: '请填写所有必填项。',
      login_title: '登录',
      password: '密码',
      keep_signed_in: '在此设备上保持登录',
      keep_note: '90 天内有效，或直到密码更改',
      forgot: '忘记密码？',
      create_account: '创建账户',
      login_btn: '登录',
      login_blank: '请输入邮箱和密码。',
      sign_out: '退出登录',
      my_calendar: '我的日历',
      missing_title: '此地址没有日历',
      missing_text: '请检查你收到的链接，或创建自己的日历。',
      unpublished_title: '此日历尚未发布',
      unpublished_text: '其所有者还需确认邮箱。请稍后再来。',
      go_home: '返回首页',
      wd: [ '日', '一', '二', '三', '四', '五', '六' ]
    },

    fr: {
      refresh: 'Actualiser',
      request: 'Demander une séance',
      login: 'Se connecter',
      theme: 'Passer du clair au sombre',
      language: 'Langue',
      today: 'Aujourd’hui',
      prev_week: 'Semaine précédente',
      next_week: 'Semaine suivante',
      grid: 'Grille',
      list: 'Liste',
      day: 'Jour',
      week: 'Semaine',
      month: 'Mois',
      screenshot: 'Capturer l’horaire de la semaine',
      public_view: 'Vue publique :',
      public_view_text: 'Les créneaux disponibles à venir et les séances occupées, anonymisées, sont affichés. Les créneaux passés sont masqués, et les noms et notes privés ne sont jamais affichés.',
      loading: 'Chargement…',
      updated_by: '{owner} a mis à jour l’horaire {when}',
      not_saved: '{owner} n’a encore enregistré aucun créneau',
      refreshed_now: 'Actualisé à l’instant',
      refreshed_at: 'Actualisé à {time}',
      request_title: 'Demander une séance',
      request_intro: 'Proposez un horaire qui vous convient. Rien n’est réservé tant que {owner} ne l’a pas confirmé.',
      your_name: 'Votre nom',
      name_placeholder: 'p. ex. Jean',
      email: 'E-mail',
      email_hint: 'pour que {owner} puisse vous répondre',
      phone: 'Téléphone',
      guardian: 'Parent / tuteur',
      optional: 'facultatif',
      starts: 'Début',
      ends: 'Fin',
      repeat: 'Répéter',
      no_repeat: 'Ne se répète pas',
      weekly: 'Chaque semaine',
      format: 'Format',
      select_one: 'Choisir',
      online: 'En ligne',
      in_person: 'En personne',
      repeat_every: 'Répéter toutes les',
      weeks: 'semaine(s)',
      repeat_on: 'Répéter le',
      never: 'Jamais',
      on: 'Le',
      after: 'Après',
      occurrences: 'fois',
      subject: 'Matière',
      outside_hours: 'Hors des heures disponibles',
      warning_footer: 'Vous pouvez quand même envoyer cette demande. {owner} confirmera si l’horaire convient.',
      cancel: 'Annuler',
      send_request: 'Envoyer la demande',
      send_anyway: 'Envoyer quand même',
      request_sent: 'Demande envoyée. {owner} la confirmera avant qu’elle apparaisse sur le calendrier.',
      need_name: 'Veuillez saisir votre nom.',
      need_email: 'Veuillez saisir une adresse à laquelle {owner} peut répondre.',
      need_subject: 'Veuillez saisir la matière.',
      need_format: 'Veuillez choisir en ligne ou en personne.',
      need_times: 'Veuillez choisir une heure de début et de fin.',
      end_after_start: 'L’heure de fin doit être après l’heure de début.',
      fill_required: 'Veuillez remplir tous les champs obligatoires.',
      login_title: 'Se connecter',
      password: 'Mot de passe',
      keep_signed_in: 'Rester connecté sur cet appareil',
      keep_note: 'pendant 90 jours, ou jusqu’au changement du mot de passe',
      forgot: 'Mot de passe oublié ?',
      create_account: 'Créer un compte',
      login_btn: 'Se connecter',
      login_blank: 'Saisissez votre e-mail et votre mot de passe.',
      sign_out: 'Se déconnecter',
      my_calendar: 'Mon calendrier',
      missing_title: 'Aucun calendrier à cette adresse',
      missing_text: 'Vérifiez le lien qu’on vous a donné, ou créez votre propre calendrier.',
      unpublished_title: 'Ce calendrier n’est pas encore publié',
      unpublished_text: 'Son propriétaire doit encore confirmer son e-mail. Revenez bientôt.',
      go_home: 'Aller à l’accueil',
      wd: [ 'D', 'L', 'M', 'M', 'J', 'V', 'S' ]
    },

    ko: {
      refresh: '새로고침',
      request: '세션 요청',
      login: '로그인',
      theme: '라이트/다크 전환',
      language: '언어',
      today: '오늘',
      prev_week: '지난주',
      next_week: '다음주',
      grid: '격자',
      list: '목록',
      day: '일',
      week: '주',
      month: '월',
      screenshot: '주간 일정 캡처',
      public_view: '공개 보기:',
      public_view_text: '다가오는 가능한 시간과 익명 처리된 예약 세션이 표시됩니다. 이미 지난 시간은 숨겨지며, 비공개 일정 이름과 메모는 절대 표시되지 않습니다.',
      loading: '불러오는 중…',
      updated_by: '{owner} 님이 {when} 일정을 업데이트했습니다',
      not_saved: '{owner} 님이 아직 시간을 저장하지 않았습니다',
      refreshed_now: '방금 새로고침됨',
      refreshed_at: '{time}에 새로고침됨',
      request_title: '세션 요청',
      request_intro: '원하는 시간을 요청하세요. {owner} 님이 확인하기 전까지는 예약되지 않습니다.',
      your_name: '이름',
      name_placeholder: '예: 민준',
      email: '이메일',
      email_hint: '{owner} 님이 답장할 수 있도록',
      phone: '전화번호',
      guardian: '부모 / 보호자',
      optional: '선택',
      starts: '시작',
      ends: '종료',
      repeat: '반복',
      no_repeat: '반복 안 함',
      weekly: '매주',
      format: '방식',
      select_one: '선택하세요',
      online: '온라인',
      in_person: '대면',
      repeat_every: '반복 주기',
      weeks: '주마다',
      repeat_on: '반복 요일',
      never: '없음',
      on: '날짜',
      after: '횟수',
      occurrences: '회',
      subject: '과목',
      outside_hours: '가능한 시간 외',
      warning_footer: '그래도 요청을 보낼 수 있습니다. {owner} 님이 시간이 가능한지 확인합니다.',
      cancel: '취소',
      send_request: '요청 보내기',
      send_anyway: '그래도 보내기',
      request_sent: '요청을 보냈습니다. {owner} 님이 확인한 뒤 캘린더에 표시됩니다.',
      need_name: '이름을 입력해 주세요.',
      need_email: '{owner} 님이 답장할 수 있는 이메일을 입력해 주세요.',
      need_subject: '과목을 입력해 주세요.',
      need_format: '온라인 또는 대면을 선택해 주세요.',
      need_times: '시작과 종료 시간을 선택해 주세요.',
      end_after_start: '종료 시간은 시작 시간보다 늦어야 합니다.',
      fill_required: '필수 항목을 모두 입력해 주세요.',
      login_title: '로그인',
      password: '비밀번호',
      keep_signed_in: '이 기기에서 로그인 유지',
      keep_note: '90일 동안, 또는 비밀번호가 바뀔 때까지',
      forgot: '비밀번호를 잊으셨나요?',
      create_account: '계정 만들기',
      login_btn: '로그인',
      login_blank: '이메일과 비밀번호를 입력해 주세요.',
      sign_out: '로그아웃',
      my_calendar: '내 캘린더',
      missing_title: '이 주소에는 캘린더가 없습니다',
      missing_text: '받은 링크를 확인하거나, 직접 캘린더를 만들어 보세요.',
      unpublished_title: '이 캘린더는 아직 공개되지 않았습니다',
      unpublished_text: '소유자가 이메일을 확인해야 합니다. 잠시 후 다시 방문해 주세요.',
      go_home: '홈으로 가기',
      wd: [ '일', '월', '화', '수', '목', '금', '토' ]
    },

    vi: {
      refresh: 'Tải lại',
      request: 'Đặt buổi học',
      login: 'Đăng nhập',
      theme: 'Đổi giữa sáng và tối',
      language: 'Ngôn ngữ',
      today: 'Hôm nay',
      prev_week: 'Tuần trước',
      next_week: 'Tuần sau',
      grid: 'Lưới',
      list: 'Danh sách',
      day: 'Ngày',
      week: 'Tuần',
      month: 'Tháng',
      screenshot: 'Chụp lịch tuần',
      public_view: 'Chế độ công khai:',
      public_view_text: 'Hiển thị các khung giờ còn trống sắp tới và các buổi đã đặt (ẩn danh). Các khung giờ đã qua được ẩn, và tên sự kiện cùng ghi chú riêng tư không bao giờ hiển thị.',
      loading: 'Đang tải…',
      updated_by: '{owner} đã cập nhật lịch {when}',
      not_saved: '{owner} chưa lưu khung giờ nào',
      refreshed_now: 'Vừa tải lại',
      refreshed_at: 'Tải lại lúc {time}',
      request_title: 'Đặt buổi học',
      request_intro: 'Chọn một giờ phù hợp với bạn. Chưa có gì được đặt cho đến khi {owner} xác nhận.',
      your_name: 'Tên của bạn',
      name_placeholder: 'ví dụ: Minh',
      email: 'Email',
      email_hint: 'để {owner} có thể liên hệ lại',
      phone: 'Điện thoại',
      guardian: 'Phụ huynh / người giám hộ',
      optional: 'không bắt buộc',
      starts: 'Bắt đầu',
      ends: 'Kết thúc',
      repeat: 'Lặp lại',
      no_repeat: 'Không lặp lại',
      weekly: 'Hằng tuần',
      format: 'Hình thức',
      select_one: 'Chọn một',
      online: 'Trực tuyến',
      in_person: 'Trực tiếp',
      repeat_every: 'Lặp lại mỗi',
      weeks: 'tuần',
      repeat_on: 'Lặp vào',
      never: 'Không bao giờ',
      on: 'Vào ngày',
      after: 'Sau',
      occurrences: 'lần',
      subject: 'Môn học',
      outside_hours: 'Ngoài giờ còn trống',
      warning_footer: 'Bạn vẫn có thể gửi yêu cầu này. {owner} sẽ xác nhận giờ đó có phù hợp không.',
      cancel: 'Hủy',
      send_request: 'Gửi yêu cầu',
      send_anyway: 'Vẫn gửi',
      request_sent: 'Đã gửi yêu cầu. {owner} sẽ xác nhận trước khi nó xuất hiện trên lịch.',
      need_name: 'Vui lòng nhập tên của bạn.',
      need_email: 'Vui lòng nhập email để {owner} có thể trả lời.',
      need_subject: 'Vui lòng nhập môn học.',
      need_format: 'Vui lòng chọn trực tuyến hoặc trực tiếp.',
      need_times: 'Vui lòng chọn giờ bắt đầu và kết thúc.',
      end_after_start: 'Giờ kết thúc phải sau giờ bắt đầu.',
      fill_required: 'Vui lòng điền đầy đủ các trường bắt buộc.',
      login_title: 'Đăng nhập',
      password: 'Mật khẩu',
      keep_signed_in: 'Duy trì đăng nhập trên thiết bị này',
      keep_note: 'trong 90 ngày, hoặc đến khi đổi mật khẩu',
      forgot: 'Quên mật khẩu?',
      create_account: 'Tạo tài khoản',
      login_btn: 'Đăng nhập',
      login_blank: 'Vui lòng nhập email và mật khẩu.',
      sign_out: 'Đăng xuất',
      my_calendar: 'Lịch của tôi',
      missing_title: 'Không có lịch nào ở địa chỉ này',
      missing_text: 'Kiểm tra lại liên kết bạn nhận được, hoặc tạo lịch của riêng bạn.',
      unpublished_title: 'Lịch này chưa được công bố',
      unpublished_text: 'Chủ lịch còn phải xác nhận email. Vui lòng quay lại sau.',
      go_home: 'Về trang chủ',
      wd: [ 'CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7' ]
    }
  };

  var KEY =
    'lang';

  var current =
    'en';

  function supported(
    code
  ) {
    return Boolean( code && STRINGS[ code ] );
  }

  function stored() {
    try {
      var value =
        localStorage.getItem( KEY );
      return supported( value ) ? value : null;
    } catch ( e ) {
      return null;
    }
  }

  /*
    The device's choice, else the browser's language if it is one of
    ours, else the calendar's default.
  */
  function detect(
    fallback
  ) {
    var chosen =
      stored();
    if ( chosen ) {
      return chosen;
    }
    var browser =
      String( navigator.language || '' ).slice( 0, 2 ).toLowerCase();
    if ( supported( browser ) ) {
      return browser;
    }
    return supported( fallback ) ? fallback : 'en';
  }

  function t(
    key,
    vars
  ) {
    var table =
      STRINGS[ current ] || STRINGS.en;
    var text =
      table[ key ] !== undefined ? table[ key ] : STRINGS.en[ key ];
    if ( text === undefined ) {
      return key;
    }
    if ( typeof text !== 'string' ) {
      return text;
    }
    return text.replace( /\{(\w+)\}/g, function ( match, name ) {
      return vars && vars[ name ] !== undefined ? vars[ name ] : match;
    } );
  }

  /*
    Every element that carries a data-i18n attribute takes its text
    from the table; data-i18n-placeholder, -title and -aria do the
    same for those attributes.
  */
  function apply(
    root
  ) {
    var scope =
      root || document;
    var each =
      function ( attribute, set ) {
        var nodes =
          scope.querySelectorAll( '[' + attribute + ']' );
        for ( var i = 0; i < nodes.length; i++ ) {
          set( nodes[ i ], t( nodes[ i ].getAttribute( attribute ) ) );
        }
      };
    each( 'data-i18n', function ( node, text ) { node.textContent = text; } );
    each( 'data-i18n-placeholder', function ( node, text ) { node.setAttribute( 'placeholder', text ); } );
    each( 'data-i18n-title', function ( node, text ) { node.setAttribute( 'title', text ); node.setAttribute( 'aria-label', text ); } );
    var letters =
      scope.querySelectorAll( '[data-i18n-weekday]' );
    var names =
      t( 'wd' );
    for ( var j = 0; j < letters.length; j++ ) {
      letters[ j ].textContent = names[ Number( letters[ j ].getAttribute( 'data-i18n-weekday' ) ) ];
    }
    document.documentElement.setAttribute( 'lang', current === 'zh' ? 'zh-CN' : current );
  }

  function set(
    code,
    remember
  ) {
    if ( !supported( code ) ) {
      code = 'en';
    }
    current =
      code;
    if ( remember !== false ) {
      try {
        localStorage.setItem( KEY, code );
      } catch ( e ) {}
    }
  }

  /*
    The locale for dates and times: the language's own, or the
    browser's when English is in force.
  */
  function locale() {
    return LOCALES[ current ];
  }

  window.I18N = {
    LANGUAGES:
      LANGUAGES,
    t:
      t,
    apply:
      apply,
    set:
      set,
    get:
      function () { return current; },
    detect:
      detect,
    stored:
      stored,
    locale:
      locale
  };

})();
