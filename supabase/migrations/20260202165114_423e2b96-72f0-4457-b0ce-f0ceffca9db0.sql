-- Insert Demo Agency
INSERT INTO agencies (name, description)
VALUES ('Demo Agency', 'Demo site for showcasing the platform')
ON CONFLICT DO NOTHING;