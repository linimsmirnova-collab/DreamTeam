--миграция кароче
ATTACH DATABASE 'dream_team.db' AS staraya_db;

DELETE FROM answers;
DELETE FROM player_cards;
DELETE FROM game_session;
DELETE FROM players;
DELETE FROM question;
DELETE FROM all_cards;
DELETE FROM projects;
DELETE FROM roles; --кароче очищать плохая идея чистится исходник хз почему

INSERT INTO roles (id, name) 
SELECT id, name FROM staraya_db.roles;

INSERT INTO projects (id, name, description) 
SELECT id, name, description FROM staraya_db.projects;

INSERT INTO all_cards (id, cat_card, text) 
SELECT id, cat_card, text FROM staraya_db.all_cards;

INSERT INTO question (id, text) 
SELECT id, text FROM staraya_db.question;

INSERT INTO players (id, nickname) 
SELECT id, nickname FROM staraya_db.players;

INSERT INTO answers (id, id_session, id_question, text) 
SELECT id, 1, 1, text FROM staraya_db.answers;--тут 1 заполняется тк в новой структуре ответ привязан к сесси и вопросы а в старой версии бд такого не было а тк поле обязательное я поставил 1 потом по скрипту должна быть перезапись

DETACH DATABASE staraya_db;