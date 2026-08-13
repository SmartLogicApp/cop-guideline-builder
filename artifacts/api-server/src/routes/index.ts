import { Router, type IRouter } from "express";
import healthRouter   from "./health";
import generateRouter from "./generate";
import accountsRouter from "./accounts";
import billingRouter  from "./billing";
import adminRouter    from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generateRouter);
router.use("/accounts", accountsRouter);
router.use("/billing",  billingRouter);
router.use("/admin",    adminRouter);

export default router;
