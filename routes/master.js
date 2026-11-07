const { Router } = require('express');
const controller = require('../controllers/masterController');

const router = Router();

router.use(controller.authenticatedMaster);
router.get('/me', controller.getMe);
router.get('/dashboard', controller.getDashboard);
router.get('/users', controller.getUsers);
router.post('/users', controller.postUsers);
router.get('/users/:id', controller.getUsersById);
router.patch('/users/:id', controller.patchUsersById);
router.patch('/users/:id/status', controller.patchUsersByIdStatus);
router.post('/users/:id/wallet', controller.postUsersByIdWallet);
router.get('/user-withdrawals', controller.getUserWithdrawals);
router.patch('/user-withdrawals/:id', controller.patchUserWithdrawalsById);
router.post('/withdrawals', controller.postWithdrawals);
router.get('/wallet', controller.getWallet);
router.get('/matches', controller.getMatches);
router.use(controller.handleError);

module.exports = router;
