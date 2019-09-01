export default {
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  ssl: process.env.MAIL_SSL,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
  default: {
    from: 'Equipe GoBarber <noreply@gobarber.com>',
  },
};
