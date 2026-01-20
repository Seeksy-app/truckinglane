-- Clear leads first (due to FK constraint), then loads
DELETE FROM leads;
DELETE FROM loads WHERE template_type = 'aljex_flat';