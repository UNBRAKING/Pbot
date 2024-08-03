const express = require('express');
const app = express();
// Serve index.html file when root URL is accessed
app.get('/', (req, res) => {
    res.send('hello word')
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(Server is running on port ${PORT});
