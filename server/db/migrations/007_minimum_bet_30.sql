UPDATE platform_settings
SET setting_value = '30'
WHERE setting_key = 'minimum_bet' AND setting_value IN ('70', '300');
