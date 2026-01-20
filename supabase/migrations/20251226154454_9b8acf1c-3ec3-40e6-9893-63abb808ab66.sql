-- Delete duplicate pending invites for users who are already team members
DELETE FROM agent_invites 
WHERE id IN ('ae3f483d-5ecd-4e68-956e-f750e31a041e', '06b62184-6665-4a60-93d7-981680e40b70');