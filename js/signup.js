/*
 * signup.js
 * ------------------------------------------------------------
 * 회원가입 페이지(signup.html) 전용 스크립트.
 * - 이메일/비밀번호 가입 (이름은 user_metadata.name 으로 저장,
 *   profiles 행은 DB 트리거 sql/10_b2c_signup.sql 이 자동 생성)
 * - 이메일 확인이 켜져 있으면 안내 메시지, 꺼져 있으면 바로 홈으로
 * - 모든 에러 메시지는 한국어로 표시
 * ------------------------------------------------------------
 */

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("signup-form");
  const errorBox = document.getElementById("signup-error");
  const successBox = document.getElementById("signup-success");

  if (!isSupabaseConfigured()) {
    errorBox.textContent =
      "Supabase 설정이 필요합니다. js/supabaseClient.js 에 URL과 anon key를 입력해주세요.";
    return;
  }

  // 목업(데모) 모드에서는 실제 계정을 만들 수 없다
  if (window.DT_MOCK) {
    errorBox.textContent =
      "데모 모드에서는 회원가입이 지원되지 않습니다. 로그인 화면에서 데모를 체험해주세요.";
    form.querySelector("button[type=submit]").disabled = true;
    return;
  }

  // 이미 로그인되어 있으면 홈으로
  try {
    const profile = await getCurrentProfile();
    if (profile) {
      redirectByRole(profile.role);
      return;
    }
  } catch (e) {
    /* 세션 확인 실패 시 가입 폼을 그대로 보여준다 */
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";
    successBox.hidden = true;

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const password2 = document.getElementById("password2").value;

    if (!name) { errorBox.textContent = "이름을 입력해주세요."; return; }
    if (password.length < 6) { errorBox.textContent = "비밀번호는 6자 이상이어야 합니다."; return; }
    if (password !== password2) { errorBox.textContent = "비밀번호가 서로 다릅니다."; return; }

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "가입 중...";

    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      const msg = String(error.message || "");
      if (/already registered|already been registered/i.test(msg)) {
        errorBox.textContent = "이미 가입된 이메일입니다. 로그인해주세요.";
      } else if (/rate limit/i.test(msg)) {
        errorBox.textContent = "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.";
      } else if (/invalid.*email/i.test(msg)) {
        errorBox.textContent = "올바른 이메일 주소를 입력해주세요.";
      } else {
        errorBox.textContent = "가입에 실패했습니다. 잠시 후 다시 시도해주세요.";
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "가입하기";
      return;
    }

    // 이메일 확인이 꺼져 있으면 세션이 바로 생긴다 → 홈으로
    if (data && data.session) {
      const profile = await waitForProfile();
      redirectByRole(profile ? profile.role : "student");
      return;
    }

    // 이메일 확인이 켜져 있는 경우: 안내 후 폼 잠금
    successBox.textContent =
      "확인 메일을 보냈습니다. 메일함에서 인증 링크를 눌러 가입을 완료해주세요.";
    successBox.hidden = false;
    submitBtn.textContent = "메일을 확인해주세요";
  });
});

/* 트리거가 프로필을 만드는 짧은 시간을 대비해 몇 번 재시도 */
async function waitForProfile() {
  for (let i = 0; i < 3; i++) {
    const p = await getCurrentProfile();
    if (p) return p;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/* role 별 시작 페이지로 이동 */
function redirectByRole(role) {
  if (role === "student") window.location.href = "/student.html";
  else window.location.href = "/admin.html";
}
