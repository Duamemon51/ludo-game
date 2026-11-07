const { Router } = require('express');
const controller = require('../controllers/playerController');

const router = Router();

router.use(controller.authenticatePlayer);
router.get('/me', controller.getMe);
router.get('/tournaments', controller.getTournaments);
router.get('/wallet', controller.getWallet);
router.get('/matches', controller.getMatches);
router.post('/requests', controller.postRequests);
router.post('/withdrawals', controller.postWithdrawals);
router.use(controller.handleError);

module.exports = router;
