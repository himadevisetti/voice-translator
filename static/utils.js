function onSignIn(googleUser) {
    console.log('Google Auth Response', googleUser);
    // We need to register an Observer on Firebase Auth to make sure auth is initialized.
    var unsubscribe = firebase.auth().onAuthStateChanged(function (firebaseUser) {
        unsubscribe();
        // Check if we are already signed-in Firebase with the correct user.
        if (!isUserEqual(googleUser, firebaseUser)) {
            // Get the idToken
            var idToken = googleUser.getAuthResponse().id_token;
            // Build Firebase credential with the Google ID token.
            var credential = firebase.auth.GoogleAuthProvider.credential(idToken);
            // Sign in with credential from the Google user.
            firebase.auth().signInWithCredential(credential)
                .then((result) => {
                    console.log("signed in with credential");
                    createSession(googleUser);
                });
        } else {
            console.log('User already signed-in Firebase.');
            createSession(firebaseUser);
        }
    });
}

function isUserEqual(googleUser, firebaseUser) {
    if (firebaseUser) {
        var providerData = firebaseUser.providerData;
        for (var i = 0; i < providerData.length; i++) {
            if (providerData[i].providerId === firebase.auth.GoogleAuthProvider.PROVIDER_ID &&
                providerData[i].uid === googleUser.getBasicProfile().getId()) {
                // We don't need to reauth the Firebase connection.
                return true;
            }
        }
    }
    return false;
}

function getCookie(name) {
    const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
    return v ? v[2] : null;
}

function createSession(user) {
    // Get Google user email from profile
    var profile = user.getBasicProfile();
    var login = profile.getEmail();

    // var csrf_token = Cookies.get("XSRF-TOKEN");
    var csrf_token = getCookie("XSRF-TOKEN");

    return firebase.auth().currentUser.getIdToken()
        .then(function (idToken) {
            return fetch("/sessionLogin", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    "CSRF-Token": csrf_token,
                },
                body: JSON.stringify({ idToken, login }),
            });
        })
        .then(() => {
            return firebase.auth().signOut();
        })
        .then(() => {
            window.location.assign("/landing");
        })
        .catch(function (error) {
            // Handle Errors here.
            var errorCode = error.code;
            var errorMessage = error.message;
            // The email of the user's account used.
            var email = error.email;
            // The firebase.auth.AuthCredential type that was used.
            var credential = error.credential;
            // ...
        });
}

function loginError(error) {

    var errorCode = error.code;
    var errorMessage = error.message;
    if (errorCode === 'auth/wrong-password') {
        // alert('Wrong password.');
        errorPassword.innerHTML = "Wrong password.";
        document.getElementById('password').focus();
    } else {
        // alert(errorMessage);
        errorPassword.innerHTML = errorMessage;
    }
    // window.location.assign("/login");

}