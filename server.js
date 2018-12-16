
// Farza Nurifan

// Import
const bodyParser = require('body-parser')
const methodOverride = require('method-override')
const express = require('express')
const partials = require('express-partials')
const http = require('http')
const mysql = require('mysql')
const passwordHash = require('password-hash')
const session = require('express-session')
const Redis = require('ioredis')

// Express config
const app = express()
app.set('port', 3000)
app.use(bodyParser.urlencoded({ extended: true }))
app.use(methodOverride('_method'))
app.set('view engine', 'ejs')
app.use(partials())
app.use(session({ secret: 'secret' }))

// MySql config
var connection = mysql.createConnection({
    host: '192.168.33.10',
    user: 'bdt',
    password: 'bdt',
    database: 'bdt',
    port: '6033'
})

// Connect MySql
connection.connect(err => {
    if (err) throw err
})

// Redis config
var cluster = new Redis.Cluster([{
    port: 7001,
    host: '192.168.34.11'
}, {
    port: 7002,
    host: '192.168.34.12'
}, {
    port: 7003,
    host: '192.168.34.13'
}, {
    port: 7004,
    host: '192.168.34.11'
}, {
    port: 7005,
    host: '192.168.34.12'
}, {
    port: 7006,
    host: '192.168.34.13'
}])

// EJS view variables
const pageItem = 20 // Items per page on table
const fields = ['Id', 'Review', 'Label']

// Table pagination settings
const pagination = (results, page) => {
    var pages = Math.ceil(results / pageItem)
    let first = 2
    let last = 9
    if (pages <= 11) {
        last = pages - 1
    }
    else if (page > 6 && !(page > pages - 6)) {
        first = page - 3
        last = page + 3
    }
    else if (page > pages - 6) {
        first = pages - 8
        last = pages - 1
    }
    return { pages, first, last }
}

// Cache
const cache = (req, res, next) => {
    var search = req.params.search
    cluster.get(search, (err, data) => {
        if (err) throw err
        if (data) {
            console.log('from cache')
            res.render('index.ejs', JSON.parse(data))
        }
        else next()
    })
}

// Query
const stringFields = 'Review, Label'
const insertQuery = input => `'${input['Review']}', '${input['Label']}'`
const updateQuery = input => `Review = '${input['Review']}',Label = '${input['Label']}'`


// Routing //
app.get('/login', (req, res) => {
    res.render('login.ejs')
})

app.get('/logout', (req, res) => {
    req.session.destroy(function (err) {
        if (err) throw err
        else res.redirect('/login')
    })
})

app.post('/loginuser', (req, res) => {
    var email = req.body.email
    var password = req.body.password
    var query = `SELECT * FROM user WHERE email = '${email}'`
    connection.query(query, (err, results) => {
        if (err) throw err
        result = JSON.parse(JSON.stringify(results))[0]
        var loggedIn = passwordHash.verify(password, result.password)
        if (loggedIn) {
            sess = req.session
            sess.email = email
            res.redirect('/')
        }
        else res.redirect('/login')
    })
})

app.get('/register', (req, res) => {
    res.render('register.ejs')
})

app.post('/registeruser', (req, res) => {
    var name = req.body.name
    var email = req.body.email
    var password = passwordHash.generate(req.body.password)
    var query = `INSERT INTO user (name, email, password) VALUES ("${name}", "${email}", "${password}")`
    connection.query(query, (err, results) => {
        if (err) throw err
        res.redirect('/login')
    })
})

app.get('/', (req, res) => res.redirect('/page/1'))

app.get('/page/:page', (req, res) => {
    sess = req.session
    if (sess.email) {
        var page = Number(req.params.page)
        var query = `SELECT * FROM reviews LIMIT ${pageItem * (page - 1)}, ${pageItem}`
        connection.query(query, (err, results) => {
            if (err) throw err
            connection.query('SELECT COUNT(*) FROM reviews', (err, count) => {
                var newRes = JSON.parse(JSON.stringify(results))
                var all = JSON.parse(JSON.stringify(count))[0]['COUNT(*)']
                var paginate = pagination(all, page)
                res.render('index.ejs', { results: newRes, page, ...paginate, fields, search: false, query: '' })
            })
        })
    }
    else res.redirect('/login')
})

app.get('/add', (req, res) => {
    sess = req.session
    if (sess.email) {
        res.render('add.ejs', { fields: fields.slice(1) })
    }
    else res.redirect('/login')
})

app.post('/create', (req, res) => {
    sess = req.session
    if (sess.email) {
        var input = req.body
        var query = `INSERT INTO reviews (${stringFields}) VALUES (${insertQuery(input)})`
        connection.query(query, (err, results) => {
            if (err) throw err
            res.redirect('/')
        })
    }
    else res.redirect('/login')
})

app.get('/edit/:id', (req, res) => {
    sess = req.session
    if (sess.email) {
        var id = req.params.id
        var query = `SELECT * FROM reviews WHERE id = '${id}'`
        connection.query(query, (err, results) => {
            if (err) throw err
            var result = JSON.parse(JSON.stringify(results))[0]
            res.render('edit.ejs', { result, fields: fields.slice(1) })
        })
    }
    else res.redirect('/login')
})

app.put('/update/:id', (req, res) => {
    sess = req.session
    if (sess.email) {
        var id = req.params.id
        var input = req.body
        var query = `UPDATE reviews SET ${updateQuery(input)} WHERE id = '${id}'`
        connection.query(query, (err, results) => {
            if (err) throw err
            res.redirect('/')
        })
    }
    else res.redirect('/login')
})

app.delete('/delete/:id', (req, res) => {
    sess = req.session
    if (sess.email) {
        var id = req.params.id
        var query = `DELETE FROM reviews WHERE id = '${id}'`
        connection.query(query, (err, results) => {
            if (err) throw err
            res.redirect('/')
        })
    }
    else res.redirect('/login')
})

app.post('/search', (req, res) => {
    sess = req.session
    if (sess.email) {
        var search = req.body.search
        if (search) {
            res.redirect(`/search/${search}/page/1`)
        }
        else {
            res.redirect('/')
        }
    }
    else res.redirect('/login')
})

app.get('/search/:search/page/:page', cache, (req, res) => {
    sess = req.session
    if (sess.email) {
        var page = Number(req.params.page)
        var search = req.params.search
        var query = `SELECT * FROM reviews WHERE Review LIKE '%${search}%' LIMIT ${1000 * (page - 1)}, 1000`
        connection.query(query, (err, results) => {
            if (err) throw err
            connection.query('SELECT COUNT(*) FROM reviews', (err, count) => {
                var newRes = JSON.parse(JSON.stringify(results))
                var all = JSON.parse(JSON.stringify(count))[0]['COUNT(*)']
                var paginate = pagination(all, page)
                cluster.setex(search, 3600, JSON.stringify({ results: newRes, page, ...paginate, fields, search: true, query: search }))
                console.log('from database')
                res.render('index.ejs', { results: newRes, page, ...paginate, fields, search: true, query: search })
            })
        })
    }
    else res.redirect('/login')
})

http.createServer(app).listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'))
})