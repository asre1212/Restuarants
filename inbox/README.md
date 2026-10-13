# Encrypted restaurant delivery queue

Only encrypted delivery envelopes belong here. Never commit plaintext restaurant notes, exports, encryption keys or credentials. The app's **Force pull list** button downloads and saves an authorized delivery locally, verifies the saved records, then acknowledges its receipt. The cleanup workflow removes acknowledged envelopes from the current branch. Git history retains ciphertext; notebook data remains local. Prepared deliveries expire after seven days.
