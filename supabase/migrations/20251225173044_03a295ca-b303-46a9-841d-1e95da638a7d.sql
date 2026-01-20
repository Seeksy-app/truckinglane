-- Update leads with actual transcript summaries from elevenlabs_post_calls
UPDATE leads SET notes = 'The user, Abdul, inquired about loads from Alabama to Wisconsin. The agent found loads from Centre, AL to Greenleaf, WI. Abdul requested details on the load picking up on December 22nd. After some conversational difficulties, Abdul asked to be transferred to a representative and provided his name and phone number. The agent confirmed the information and stated that dispatch would call shortly. The user then requested music, which the agent was unable to provide.'
WHERE id = '58ab202e-b5ca-4da8-8c91-276e7f1741a2';

UPDATE leads SET notes = 'The user, Victor, called D and L Transport about a load. The user was initially hostile, questioning if the agent was real and using offensive language. Despite the user''s behavior, the agent confirmed it was an AI and offered to connect the user with dispatch, requesting his name and phone number. The user eventually provided his name and phone number after further prompting. The agent confirmed the number and stated dispatch would call shortly.'
WHERE id = '1ff9c99e-f912-4c73-99ae-2c98790409b5';

UPDATE leads SET notes = 'Jess from D and L Transport received a call about load number 171-1634. The user, Alex, requested a transfer to a life agency. Jess is transferring Alex to dispatch and obtained his name and phone number (224-955-1180). Dispatch will call Alex shortly.'
WHERE id = '9c907cc5-87cd-4ec6-9f98-53f883b45c65';

UPDATE leads SET notes = 'The user called D and L Transport about load number 1737046. The agent found three matching loads from Plainview to Casa Grande for $1000 each and asked the user to specify which one they were interested in. The user stated they were not interested in any of them and ended the call.'
WHERE id = '63b539bf-8ac7-40ec-9776-b858dfe71f41';

UPDATE leads SET notes = 'The user inquired about load 1745692. The agent confirmed the load details and the user expressed interest and requested to speak with a human. The user provided their name (Alex) and phone number (224-532-249). The agent confirmed the number incorrectly, prompting a correction from the user.'
WHERE id = '3aea4f47-289d-4726-bee0-722b260a94d5';

UPDATE leads SET notes = 'The user called D&L Transport looking for a load from Arizona to Bryan, Texas. The agent found three matching loads from Kingman, AZ to Bryan, TX. The user then corrected the origin and destination to Kingsman, Arizona to Brighton, Texas, but no loads were found for that route. The agent offered alternative loads from Columbia City, Indiana to Fort Lauderdale, Florida.'
WHERE id = 'd96ea0fe-038b-4323-b476-47bdcc35d1ba';

UPDATE leads SET notes = 'The user inquired about a load from Arizona to Texas. After initial confusion about the location, the agent found three loads from Kingman, AZ to Bryan, TX for $1600. The user accepted one of the loads. The agent collected a callback number and created a lead for a broker to follow up. The call concluded after the user confirmed they didn''t need further assistance.'
WHERE id = '130bbb31-3eed-429a-b3a1-c8692e025ffb';

UPDATE leads SET notes = 'The user, Brandon Steele, inquired about a load from Doit, Texas, to Huddle, Texas, then corrected the destination to Hueyton Tech. The agent repeatedly provided results for Columbia City to Fort Lauderdale. Frustrated, the user requested to speak with dispatch and provided his name and phone number. The agent confirmed the callback.'
WHERE id = '4e89f46b-6fa4-415b-8ff7-308441f7155b';

UPDATE leads SET notes = 'The user inquired about a load from Santa, Alabama, to Greenleaf, Wisconsin. The agent found three loads from Centre, Alabama, to Greenleaf, Wisconsin, and provided details on one with a pickup date of December 22, 2025. The user requested to speak with a representative and provided their name and phone number for a callback.'
WHERE id = '4757560f-1ebf-46f0-8e85-2b0ab42b049e';

UPDATE leads SET notes = 'The user inquired about load 9185708. The agent found three matching loads from Columbia City, IN to Ft Lauderdale, FL, all with the same details. The user then made unclear requests and the agent transferred the user to dispatch.'
WHERE id = 'ab1556dd-b309-451c-8324-aac01ab1f244';