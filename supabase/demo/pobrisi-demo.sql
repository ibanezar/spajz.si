-- Pobriše vse izmišljene oglase in prodajalce iz demo-oglasi.sql.
-- Izbris uporabnika samodejno pobriše tudi profil, oglase, slike v tabeli in prijave.
delete from auth.users where email like '%@demo.spajz.si';

-- Nato lahko iz projekta odstraniš še mapo img/demo/.
