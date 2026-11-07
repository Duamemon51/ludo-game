const { Router } = require('express');
const controller = require('../controllers/healthController');

const router = Router();

router.get('/', controller.getRoot);
router.get('/api/health', controller.getHealth);

module.exports = router;
