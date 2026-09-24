import { Router, type IRouter } from "express";
import generateRouter from "./generate";
import accountsRouter from "./accounts";
import billingRouter  from "./billing";
import adminRouter    from "./admin";
import affiliatesRouter from "./affiliates";
import affiliateAgreementsRouter from "./affiliate-agreements";
import gapHistoryRouter from "./gapHistory";
import affiliateComplianceRouter from "./affiliate-compliance";

const router: IRouter = Router();

router.use(generateRouter);
router.use("/accounts", accountsRouter);
router.use("/billing",  billingRouter);
router.use("/admin",    adminRouter);
router.use("/affiliates/agreements", affiliateAgreementsRouter);
router.use("/affiliates", affiliatesRouter);
router.use("/affiliate-compliance", affiliateComplianceRouter);
router.use(gapHistoryRouter);

export default router;
