-- Delete demo agencies (ones with no members)
DELETE FROM agencies WHERE id IN (
  'ae74aa86-9022-4e16-93f2-082b0b3099ed',
  'f947a607-492f-4633-a293-eebf6d7266ac'
);