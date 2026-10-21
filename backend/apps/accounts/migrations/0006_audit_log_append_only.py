"""Make the audit table append-only in PostgreSQL itself (SAD D-6).

The ORM already refuses updates and deletes; this trigger also stops raw SQL and other
clients. TRUNCATE is left alone: it is not a row operation and the test runner needs it.
"""

from django.db import migrations

CREATE_TRIGGER = """
CREATE FUNCTION accounts_auditlog_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'accounts_auditlog is append-only: % is not allowed', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_auditlog_append_only
    BEFORE UPDATE OR DELETE ON accounts_auditlog
    FOR EACH ROW EXECUTE FUNCTION accounts_auditlog_append_only();
"""

DROP_TRIGGER = """
DROP TRIGGER IF EXISTS accounts_auditlog_append_only ON accounts_auditlog;
DROP FUNCTION IF EXISTS accounts_auditlog_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_audit_log"),
    ]

    operations = [
        migrations.RunSQL(CREATE_TRIGGER, reverse_sql=DROP_TRIGGER),
    ]
