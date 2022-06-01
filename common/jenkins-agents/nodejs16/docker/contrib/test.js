var oracledb = require('oracledb');
let connection = oracledb.getConnection({
    user: 'me',
    password: 'secret',
    connectString: 'localhost/orclpdb1',
});
