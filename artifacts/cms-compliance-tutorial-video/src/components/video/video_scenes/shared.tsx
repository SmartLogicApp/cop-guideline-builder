import { motion } from 'framer-motion';

export const Logo = ({ className = "" }) => (
  <motion.img 
    src={`${import.meta.env.BASE_URL}logo.svg`}
    alt="Logo"
    className={`w-16 h-16 ${className}`}
  />
);

export const MedicalGrid = () => (
  <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{
    backgroundImage: `linear-gradient(var(--color-secondary) 1px, transparent 1px), linear-gradient(90deg, var(--color-secondary) 1px, transparent 1px)`,
    backgroundSize: '40px 40px'
  }} />
);

export const AnimatedPulse = () => (
  <motion.div
    className="absolute w-[600px] h-[600px] rounded-full border border-accent opacity-20 pointer-events-none"
    initial={{ scale: 0, opacity: 0 }}
    animate={{ 
      scale: [0, 1.5, 3],
      opacity: [0, 0.2, 0]
    }}
    transition={{
      duration: 4,
      ease: "easeOut",
      repeat: Infinity,
      repeatDelay: 1
    }}
  />
);

export const springSnappy = { type: "spring", stiffness: 400, damping: 30 };
export const springBouncy = { type: "spring", stiffness: 300, damping: 15 };
export const springSmooth = { type: "spring", stiffness: 120, damping: 25 };

export const textVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springSnappy }
};
