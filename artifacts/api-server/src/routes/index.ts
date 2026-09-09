import { Router, type IRouter } from "express";
import generateRouter from "./generate";
import accountsRouter from "./accounts";
import billingRouter  from "./billing";
import adminRouter    from "./admin";
import gapHistoryRouter from "./gapHistory";

const router: IRouter = Router();

router.use(generateRouter);
router.use("/accounts", accountsRouter);
router.use("/billing",  billingRouter);
router.use("/admin",    adminRouter);
router.use(gapHistoryRouter);

export default router;
