const { Router } = require('express');
const controller = require('../controllers/authController');

const router = Router();

router.post('/login', controller.loginLimiter, controller.postLogin);
router.use(controller.handleError);

module.exports = router;
