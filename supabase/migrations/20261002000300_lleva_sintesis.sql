-- Portal CE: no todos los documentos llevan Síntesis (por ejemplo, la agenda o un anexo).
-- Los que no la llevan cuentan como completos una vez recibidos. Solo admin cambia este dato:
-- el disparador documentos_solo_estado ya limita a edición a cambiar recibido y sintesis.
alter table public.documentos add column lleva_sintesis boolean not null default true;
