-- Which photo a meal item was seen in (08 §4.4), so the meal shows each photo with its own foods.
-- Null for typed items and for items read before this column existed. No foreign key: a photo can be
-- removed from the meal while the food it showed stays.
ALTER TABLE meal_item ADD COLUMN media_id uuid;
