const { Router } = require('express');
const controller = require('../controllers/adminController');

const router = Router();

router.use(controller.authenticatedSuperAdmin);
router.get('/auth/me', controller.getAuthMe);
router.get('/dashboard', controller.getDashboard);
router.get('/masters', controller.getMasters);
router.post('/masters', controller.postMasters);
router.get('/masters/:id', controller.getMastersById);
router.patch('/masters/:id', controller.patchMastersById);
router.patch('/masters/:id/status', controller.patchMastersByIdStatus);
router.post('/masters/:id/wallet', controller.postMastersByIdWallet);
router.get('/withdrawals', controller.getWithdrawals);
router.patch('/withdrawals/:id', controller.patchWithdrawalsById);
router.get('/users', controller.getUsers);
router.patch('/users/:id/status', controller.patchUsersByIdStatus);
router.get('/matches', controller.getMatches);
router.get('/money', controller.getMoney);
router.get('/audit', controller.getAudit);
router.get('/settings', controller.getSettings);
router.put('/settings', controller.putSettings);
router.use(controller.handleError);

module.exports = router;
