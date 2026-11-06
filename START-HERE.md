# Calls app (shows up on the iPhone as "FaceTime")

**What it is:** your call page (the same file as the website), inside a real iPhone app.
"Start call" is handed to iOS itself, so the call rings on the **real iPhone call screen**,
locked or in your pocket, with vibration, and earpiece / speaker button / AirPods all handled by iOS.
When you answer, the voice recording plays; when it ends, the hang-up sound plays and the call ends by itself.

**Ringtone:** pick your own in a contact's call setup (a file, or paste a link). The app plays it using
media volume and repeats it while the call is ringing. Or tap "Use" next to "iPhone ringtone" to let
iOS provide the call ringtone. iOS controls interruptions, ringer settings and the actual output route.

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
- The GitHub Actions workflow is not in this archive. Keep the existing `.github` folder in your repository.

## Good to know
- Swiping the app away kills it: a planned call then can't ring (you get a "Missed Call" notice instead). Use Cancel to stop a call.
- Put the contact's real phone number in the call setup: iPhone then shows their real name, photo and Contact Poster.
- Tapping one of these calls in Recents calls that person for real with Apple's FaceTime (after a confirm).

## Before submitting
- Extract this archive, and replace the app files in the same repository folder where `App.js` already lives. Do not delete the repository's `.github` folder: it was not included in the supplied archive. Back up the repository first.
- A native iPhone build and device test are still required. Test the default ringtone, an 11-second custom ringtone across multiple repeats, and voice playback on the receiver, speaker and headphones. Check locked/unlocked and silent/ring modes.
- Incoming calls currently stop ringing after 30 seconds. Compressed files can contain silence or encoder padding, and iOS can interrupt app audio; a completely gap-free repeat cannot be guaranteed for every file or situation.
- The FaceTime-like name and branding may violate Apple's App Review rules on copycats or impersonation. Review the branding and background modes before submitting.
