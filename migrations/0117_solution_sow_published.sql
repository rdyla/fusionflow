-- SOW publish gate. While draft (0, default) the customer (client portal) does
-- not see the pricing summary or the rendered SOW on the solution — only once a
-- PM/SA flips it to published (1) for customer review. Staff always see both.
ALTER TABLE solutions ADD COLUMN sow_published INTEGER NOT NULL DEFAULT 0;
