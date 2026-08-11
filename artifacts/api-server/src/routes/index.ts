import { Router, type IRouter } from "express";
import healthRouter   from "./health";
import generateRouter from "./generate";
import accountsRouter from "./accounts";
import billingRouter  from "./billing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generateRouter);
router.use("/accounts", accountsRouter);
router.use("/billing",  billingRouter);

export default router;
