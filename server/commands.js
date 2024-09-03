import { parseArgs } from 'node:util';
import { ROLES } from './auth.js';

const USAGE = `usage:
  cli.js create-user --email <email> --name <name> --role <${ROLES.join('|')}> (--password-stdin | env INCIDENT_PASSWORD)
  cli.js list-users
  cli.js migrate-store --from <json file> --to <sqlite file>`;

// Command implementations take their collaborators as arguments so they can be
// tested without touching the real store, stdin or process.env.
export async function runCommand(argv, { auth, readStdin, env = {}, out = () => {}, openJson, openSqlite }) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'create-user': {
      const { values } = parseArgs({
        args: rest,
        options: {
          email: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', default: 'responder' },
          'password-stdin': { type: 'boolean', default: false },
        },
      });
      if (!values.email || !values.name) throw new Error(`--email and --name are required\n${USAGE}`);
      if (!ROLES.includes(values.role)) throw new Error(`role must be one of ${ROLES.join(', ')}`);
      let password = env.INCIDENT_PASSWORD;
      if (values['password-stdin']) password = (await readStdin()).replace(/\r?\n$/, '');
      if (!password) throw new Error('no password given: use --password-stdin or set INCIDENT_PASSWORD');
      const user = await auth.createUser({ email: values.email, name: values.name, role: values.role, password });
      out(`created ${user.role} ${user.email} (${user.id})`);
      return 0;
    }
    case 'list-users': {
      for (const u of auth.listUsers()) out(`${u.id}  ${u.role.padEnd(9)} ${u.email}  ${u.name}${u.disabled ? '  [disabled]' : ''}`);
      return 0;
    }
    case 'migrate-store': {
      const { values } = parseArgs({ args: rest, options: { from: { type: 'string' }, to: { type: 'string' } } });
      if (!values.from || !values.to) throw new Error(`--from and --to are required\n${USAGE}`);
      const source = await openJson(values.from);
      const target = await openSqlite(values.to);
      try {
        const dump = source.exportAll();
        if (Object.values(target.exportAll().collections).some((docs) => Object.keys(docs).length > 0)) {
          throw new Error(`${values.to} already contains data; migrate into an empty database`);
        }
        target.importAll(dump);
        for (const [name, docs] of Object.entries(dump.collections)) out(`${name}: ${Object.keys(docs).length}`);
        out('done');
      } finally {
        source.close();
        target.close();
      }
      return 0;
    }
    default:
      throw new Error(USAGE);
  }
}
