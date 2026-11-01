# Calls app (shows up on the iPhone as "FaceTime")

**What it is:** your call page (the same file as the website), inside a real iPhone app.
"Start call" is handed to iOS itself, so the call rings on the **real iPhone call screen**:
your own ringtone + vibration, silent switch and Focus respected, locked or in your pocket,
earpiece / speaker button / AirPods all handled by iOS. When you answer, the voice recording plays;
when it ends, the hang-up sound plays and the call ends by itself.

**The disguise:** the app is called **FaceTime** with a FaceTime-style icon, and opening it shows a
FaceTime screen (New FaceTime and the recent calls really work, through Apple's FaceTime).
The call screen says "FaceTime Audio", exactly like a real FaceTime call.

**Your secret door:** hold the big **"FaceTime"** title for 1 second.
Then press and hold a contact to set up a call. Leaving the app (home, lock, app switcher)
closes the door again.

## What's inside
- `web/index.html` – the call page (same file as the website). To update the app: replace it, run the build again.
- `web/sounds/` – optional: your own hang-up sound (file name starting with `hang`, e.g. `hangup.mp3`).
- `modules/fake-call/` – the native part (CallKit calls, answer audio, missed-call notices, recent calls).
- `src/Decoy.js` – the FaceTime screen. `App.js` – ties everything together.
- `plugins/` – adds the "Quick Call" action (Shortcuts app → Back Tap).
- `../.github/workflows/calls.yml` – the one-click build ("Send Calls app to App Store").

## Good to know
- Swiping the app away kills it: a planned call then can't ring (you get a "Missed FaceTime Audio" notice instead). Use Cancel to stop a call.
- Put the contact's real phone number in the call setup: iPhone then shows their real name, photo and Contact Poster.
- Tapping one of these calls in Recents calls that person for real with Apple's FaceTime (after a confirm).
