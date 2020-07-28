// My web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDi3jGcbaMFP8TfeunoWPTYnhKwkco4C1A",
    authDomain: "teak-mantis-279104.firebaseapp.com",
    databaseURL: "https://teak-mantis-279104.firebaseio.com",
    projectId: "teak-mantis-279104",
    storageBucket: "teak-mantis-279104.appspot.com",
    messagingSenderId: "753356494760",
    appId: "1:753356494760:web:4d9b1a01650fe5f1f1af9d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// As httpOnly cookies are to be used, do not persist any state client side
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);