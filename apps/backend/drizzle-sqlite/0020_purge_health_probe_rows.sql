-- Custom SQL migration file, put your code below! --

-- Until M01-T04 the health probe INSERTed a row into search_index on every
-- ping, so any database a previous build touched carries one junk row per
-- health check - potentially millions on a long-running deployment.
--
-- Nothing else has ever written to this index (the probe was its only
-- writer), so every row in it is probe residue and clearing the whole index
-- is the correct cleanup. search_index is created contentless
-- (`content=""` in db.ts), and a contentless fts5 table rejects both
-- `DELETE FROM` and `'rebuild'`; `'delete-all'` is the supported way to
-- empty one.
INSERT INTO search_index(search_index) VALUES('delete-all');
