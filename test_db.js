const mysql = require('mysql2/promise');

async function test() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'ads_manager'
  });

  try {
    console.log("--- BUSINESS CONFIG ---");
    const [biz] = await connection.execute('SELECT * FROM business_config');
    console.log(JSON.stringify(biz, null, 2));

    console.log("\n--- USER META AUTH ---");
    const [auth] = await connection.execute('SELECT business_id, fb_email, SUBSTRING(access_token, 1, 15) as token FROM user_meta_auth');
    console.log(JSON.stringify(auth, null, 2));

    console.log("\n--- FACEBOOK PAGES ---");
    const [pages] = await connection.execute('SELECT business_id, fb_email, page_name FROM user_facebook_pages');
    console.log(JSON.stringify(pages, null, 2));

  } catch (err) {
    console.error("DB Error:", err.message);
  } finally {
    await connection.end();
  }
}

test();
