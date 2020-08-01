function signupFormValidation() {

  var email = document.getElementById('login');

  if (validateEmail(email)) {
    createUser(email);
  }

  return false;

}

function forgotPasswordFormValidation() {

  var email = document.getElementById('login');

  if (validateEmail(email)) {
    sendPasswordResetEmail(email);
  }

  return false;

}

function passwordresetFormValidation() {

  var email = document.getElementById('login');
  var psw = document.getElementById('password');
  var pswConfirm = document.getElementById('pswConfirm');

  if (validateEmail(email)) {
    if (validatePsw(psw, 8, 12)) {
      if (validatePswConfirm(psw, pswConfirm)) {
        resetPassword(email, psw);
      }
    }
  }

  return false;

}

function uploadFormValidation() {

  var srclang = document.getElementById('srclang');
  var tgtlang = document.getElementById('tgtlang');
  var file = document.getElementById('file');
  var formData = new FormData(document.querySelector('#uploadForm'));

  if (validateSourceLanguage(srclang)) {
    if (validateTargetLanguage(tgtlang)) {
      if (validateFileUploaded(file)) {
        if (validateFileSize(file)) {
          uploadForm(formData);
        }
      }
    }
  }

  return false;

}

function validateEmail(email) {

  var mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  if (email.value.match(mailformat)) {
    errorEmail.innerHTML = "";
    return true;
  }
  else {
    // alert("You have entered an invalid email address!");
    errorEmail.innerHTML = "You have entered an invalid email address!";
    email.focus();
    return false;
  }

}

function validatePsw(psw, mx, my) {

  var psw_len = psw.value.length;
  if (psw_len == 0 || psw_len >= my || psw_len < mx) {
    // alert("Password should not be empty / length be between " + mx + " to " + my);
    errorPassword.innerHTML = "Password should not be empty / length be between " + mx + " to " + my;
    psw.focus();
    return false;
  }
  errorPassword.innerHTML = "";
  // alert("Password looks good.");
  return true;

}

function validatePswConfirm(psw, pswConfirm) {

  if (pswConfirm.value != psw.value) {
    // alert("Passwords do not match.");
    errorConfirmPsw.innerHTML = "Passwords do not match.";
    pswConfirm.focus();
    return false;
  }
  errorConfirmPsw.innerHTML = "";
  // alert("Passwords match.");
  return true;

}

function createUser(email) {

  const login = email.value;
  const password = Math.random().toString(36).slice(-8);

  firebase
    .auth()
    .createUserWithEmailAndPassword(login, password)
    .then(({ user }) => {
      user.sendEmailVerification()
        .then(function () {
          // Email sent.
          window.location.assign("/home");
        }).catch(function (error) {
          // An error happened.
          console.log("An email could not be sent due to an error " + JSON.stringify(error));
        });
    });

  return false;

}

function sendPasswordResetEmail(email) {

  const login = email.value;

  firebase
    .auth()
    .sendPasswordResetEmail(login).then(function () {
      // Email sent.
      window.location.assign("/home");
    }).catch(function (error) {
      // An error happened.
      console.log("An email could not be sent due to an error " + JSON.stringify(error));
    });

  return false;

}

function getCookie(name) {
  const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
  return v ? v[2] : null;
}

function resetPassword(email, psw) {

  console.log("All fields are valid!");

  const login = email.value;
  const password = psw.value;

  var csrf_token = getCookie("XSRF-TOKEN");
  console.log("csrf_token value: " + csrf_token);

  return fetch("/updatePassword", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "CSRF-Token": csrf_token,
    },
    body: JSON.stringify({ login, password }),
  })
    .then(() => {
      console.log("password reset complete.");
      alert("Password updated successfully. Please login");
      statusText.innerHTML = "Password updated successfully. Please login";
      window.location.assign("/login");
    })
    .catch((error) => {
      console.log("Error updating password " + error);
    });

}

function validateSourceLanguage(srclang) {

  var srclangValue = srclang.value;
  if (srclangValue === "") {
    // alert("Please select 'From' language.");
    // errorSrclang.innerHTML = "Please select 'from' language.";
    srclang.className = "error";
    srclang.focus();
    return false;
  }
  // errorSrclang.innerHTML = "";
  srclang.className = "";
  return true;

}

function validateTargetLanguage(tgtlang) {

  var tgtlangValue = tgtlang.value;
  if (tgtlangValue === "") {
    // alert("Please select 'To' language.");
    // errorTgtlang.innerHTML = "Please select 'to' language.";
    tgtlang.className = "error";
    tgtlang.focus();
    return false;
  }
  // errorTgtlang.innerHTML = "";
  tgtlang.className = "";
  return true;

}

function validateFileUploaded(file) {

  file.required = true;
  var uploadedFile = file.files[0];
  if (file.files.length === 0) {
    // alert("Please upload a file.");
    errorFile.innerHTML = "Please upload a file.";
    file.focus();
    return false;
  }
  errorFile.innerHTML = "";
  return true;

}

function validateFileSize(file) {

  var fileSize = file.files[0].size;
  const size = Math.round((fileSize / 1024));
  if (size > 102400) {
    // alert("File too big, please upload a file less than 100MB.");
    errorFile.innerHTML = "File too big, please upload a file less than 100MB.";
    file.focus();
    return false;
  }
  errorFile.innerHTML = "";
  return true;

}

function uploadForm(formData) {

  showLoading("#loadingIcon");
  document.getElementById('upload').disabled = true;

  var xhr = new XMLHttpRequest();
  xhr.open('post', '/upload', true);
  xhr.setRequestHeader("CSRF-Token", Cookies.get("XSRF-TOKEN"));
  // xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) {
      var percentage = (e.loaded / e.total) * 100;
      console.log(percentage + "%");
    }
  };

  xhr.onerror = function (e) {
    console.log('Error');
    console.log(e);
  };
  xhr.onload = function () {
    console.log("onload function");
  };

  xhr.send(formData);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      window.location.assign("/viewstatus");
    }
  }
  // window.location.assign("/viewstatus");
  return false;

}

var insertHtml = function (selector, html) {
  var targetElem = document.querySelector(selector);
  targetElem.innerHTML = html;
};

// Show loading icon inside element identified by 'selector'.
var showLoading = function (selector) {
  var html = "<div class='centertext'>";
  html += "<img src='./ajax-loader.gif'></div>";
  insertHtml(selector, html);
};
