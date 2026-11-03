# Calls app (shows up on the iPhone as "FaceTime")

**What it is:** your call page (the same file as the website), inside a real iPhone app.
"Start call" is handed to iOS itself, so the call rings on the **real iPhone call screen**,
locked or in your pocket, with vibration, and earpiece / speaker button / AirPods all handled by iOS.
When you answer, the voice recording plays; when it ends, the hang-up sound plays and the call ends by itself.

**Ringtone:** pick your own in a contact's call setup (a file, or paste a link). The app plays it itself,
so it rings even when the iPhone is on silent (at your media volume). Or tap "Use" next to
"iPhone ringtone" to ring with the iPhone's own ringtone (that one follows the silent switch).

**The call screen:** answer with the iPhone unlocked, or tap the call in the Dynamic Island,
and the app shows an iPhone-style call screen: timer, Speaker, Mute, Keypad (with key tones), More, End.

**The disguise:** the app's name is "FaceTime" with the first "e" swapped for a look-alike letter
(Cyrillic "е"), because Apple blocks the real name. It looks exactly the same, and calls say
"FaceTime Audio". Opening it shows a FaceTime-style screen: New FaceTime, the recent calls and
the (i) card (message / call / video / mail + that person's calls) really work, through Apple's apps.
Missed calls show a normal "Missed Call" notice.

**Your secret door:** hold the big **"FaceTime"** title for 1 second.
Then press and hold a contact to set up a call. Leaving the app (home, lock, app switcher)
closes the door again.

## What's inside
- `web/index.html` – the call page (same file as the website). To update the app: replace it, run the build again.
- `web/sounds/` – optional: your own hang-up sound (file name starting with `hang`, e.g. `hangup.mp3`).
- `modules/fake-call/` – the native part (CallKit calls, answer audio, missed-call notices, recent calls).
- `src/Decoy.js` – the FaceTime cover screen.
- `src/InCall.js` – the app's own call screen (after you answer).
- `App.js` – ties everything together.
- `plugins/` – adds the "Quick Call" action (Shortcuts app → Back Tap) and the silent sound the call screen rings with while the app plays your ringtone.
- `.github/workflows/app-store.yml` – the one-click build ("Send Calls app to App Store").

## Good to know
- Swiping the app away kills it: a planned call then can't ring (you get a "Missed Call" notice instead). Use Cancel to stop a call.
- Put the contact's real phone number in the call setup: iPhone then shows their real name, photo and Contact Poster.
- Tapping one of these calls in Recents calls that person for real with Apple's FaceTime (after a confirm).
