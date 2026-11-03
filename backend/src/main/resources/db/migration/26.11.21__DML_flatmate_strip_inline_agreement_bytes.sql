-- Agreements are read from the host's vault by document id; inline base64 copies on old reviews are dead weight.
UPDATE flatmate_reviews
   SET agreement_doc = agreement_doc - 'dataUrl'
 WHERE agreement_doc ? 'dataUrl';
