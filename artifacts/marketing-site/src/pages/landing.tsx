import { Shield, BookOpen, FileText, ClipboardCheck, Activity, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

const siteUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
const SIGN_UP_URL = siteUrl("/sign-up");
const SIGN_IN_URL = siteUrl("/sign-in");
const TERMS_URL = siteUrl("/terms");
const PRIVACY_URL = siteUrl("/privacy");
const CONTACT_URL = "mailto:CMSComplianceGaurdian@outlook.com?subject=Enterprise%20Inquiry";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 }
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="CMS Compliance Suite Logo" className="h-8 w-8" />
            <span className="text-xl font-bold tracking-tight text-primary">CMS Compliance Suite</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How it Works</a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-4">
            <a href={SIGN_IN_URL} className="text-sm font-medium text-muted-foreground hover:text-foreground hidden sm:block">
              Sign In
            </a>
            <Button asChild variant="default">
              <a href={SIGN_UP_URL}>Free Trial</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden bg-slate-50 pt-24 pb-32 sm:pt-32 sm:pb-40">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div initial="initial" animate="animate" variants={stagger} className="max-w-3xl mx-auto">
              <motion.div variants={fadeIn} className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-8">
                <span className="flex h-2 w-2 rounded-full bg-primary mr-2"></span>
                Always up-to-date with CMS regulations
              </motion.div>
              <motion.h1 variants={fadeIn} className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl text-balance">
                Navigate healthcare compliance with absolute confidence.
              </motion.h1>
              <motion.p variants={fadeIn} className="mt-6 text-lg leading-8 text-slate-600 max-w-2xl mx-auto text-balance">
                AI-powered tools across 30 cataloged CMS provider profiles—28 with verified regulatory content available today and 2 transparently marked pending verification.
              </motion.p>
              <motion.div variants={fadeIn} className="mt-10 flex items-center justify-center gap-x-6">
                <Button size="lg" className="h-12 px-8 text-base shadow-lg" asChild>
                  <a href={SIGN_UP_URL}>
                    Start 30-Day Free Trial
                  </a>
                </Button>
                <a href="#features" className="text-sm font-semibold leading-6 text-slate-900 flex items-center gap-1 hover:text-primary transition-colors">
                  Learn more <ArrowRight className="h-4 w-4" />
                </a>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* TRUST SIGNALS */}
        <section className="border-y bg-white py-12">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sm font-semibold text-muted-foreground mb-8 uppercase tracking-wider">30 CMS provider profiles cataloged · 28 verified and available today · 2 pending verification</p>
            <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-70 grayscale">
              <div className="flex items-center gap-2 font-bold text-xl text-slate-800"><Shield className="h-6 w-6"/> CMS CoPs</div>
              <div className="flex items-center gap-2 font-bold text-xl text-slate-800"><ClipboardCheck className="h-6 w-6"/> Joint Commission</div>
              <div className="flex items-center gap-2 font-bold text-xl text-slate-800"><Activity className="h-6 w-6"/> DNV NIAHO</div>
              <div className="flex items-center gap-2 font-bold text-xl text-slate-800"><CheckCircle2 className="h-6 w-6"/> ISO 9001:2015</div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="py-24 sm:py-32 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="text-base font-semibold leading-7 text-primary">Everything you need</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl text-balance">
                Four powerful tools to ensure survey readiness
              </p>
            </div>
            
            <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <BookOpen className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Compliance Guidelines</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">
                    Access verified eCFR requirements across 28 currently available CMS provider types. Two additional profiles remain unavailable until verification is complete.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Policy Templates</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">
                    Generate ready-to-use policy documents tailored to the requirements of your hospital, SNF, HHA, ASC, IRF, hospice, or other supported institution.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <ClipboardCheck className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">Inspection Readiness</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">
                    Run institution-specific, surveyor-style self-assessment checklists and identify potential deficiencies before surveyors walk through the door.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="h-12 w-12 rounded-lg bg-amber-50 flex items-center justify-center mb-4">
                    <Activity className="h-6 w-6 text-amber-600" />
                  </div>
                  <CardTitle className="text-xl">Policy Gap Scanner <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">AI-Powered</span></CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">
                    Compare your policies against the current regulations for your selected institution type. AI analysis instantly surfaces gaps and documentation risks.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-24 sm:py-32 bg-slate-900 text-slate-50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="text-base font-semibold leading-7 text-amber-400">Streamlined Workflow</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Minutes to compliance
              </p>
            </div>

            <div className="mx-auto max-w-4xl">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
                <div className="flex flex-col items-center">
                  <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 mb-6 text-xl font-bold text-white">1</div>
                  <h3 className="font-semibold text-white mb-2">Select Provider Profile</h3>
                  <p className="text-sm text-slate-400">Choose from 30 cataloged profiles, including 28 verified today.</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 mb-6 text-xl font-bold text-white">2</div>
                  <h3 className="font-semibold text-white mb-2">Pick a Tool</h3>
                  <p className="text-sm text-slate-400">Guidelines, templates, checklists, or scan.</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 mb-6 text-xl font-bold text-white">3</div>
                  <h3 className="font-semibold text-white mb-2">Generate</h3>
                  <p className="text-sm text-slate-400">Let the platform instantly build your content.</p>
                </div>
                <div className="flex flex-col items-center">
                  <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center border border-primary/50 mb-6 text-xl font-bold text-white">4</div>
                  <h3 className="font-semibold text-white mb-2">Act & Export</h3>
                  <p className="text-sm text-slate-400">Review, download, and implement with confidence.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="py-24 sm:py-32 bg-slate-50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="text-base font-semibold leading-7 text-primary">Transparent Pricing</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                The Right Plan for You
              </p>
            </div>

            <div className="mx-auto max-w-md">
              {/* Single universal plan */}
              <Card className="border-slate-200 shadow-lg relative flex flex-col">
                <CardHeader className="pb-8">
                  <CardTitle className="text-2xl mb-2">CMS Compliance Suite</CardTitle>
                  <CardDescription className="text-base">One plan for every compliance professional and organization</CardDescription>
                  <div className="mt-6 flex items-baseline gap-x-2">
                    <span className="text-5xl font-bold tracking-tight text-slate-900">$299</span>
                    <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-4 text-sm leading-6 text-slate-600">
                    <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> All staff at one facility (per CCN)</li>
                    <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> Compliance Guidelines</li>
                    <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> Policy Templates</li>
                    <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> Inspection Readiness Checklists</li>
                    <li className="flex gap-x-3"><CheckCircle2 className="h-6 w-5 flex-none text-primary" /> AI-Powered Policy Gap Scanner</li>
                  </ul>
                </CardContent>
                <CardFooter className="flex flex-col gap-4 mt-auto pt-8">
                  <Button className="w-full h-12 text-base" asChild>
                    <a href={SIGN_UP_URL}>Start Free Trial</a>
                  </Button>
                  <p className="text-xs text-center text-slate-500">30-day free trial · No credit card required</p>
                </CardFooter>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="CMS Compliance Suite Logo" className="h-6 w-6 grayscale opacity-60" />
              <span className="text-lg font-bold tracking-tight text-slate-900">CMS Compliance Suite</span>
            </div>
            <div className="flex gap-6 text-sm text-slate-500">
              <a href={SIGN_IN_URL} className="hover:text-slate-900 transition-colors">Sign In</a>
              <a href={SIGN_UP_URL} className="hover:text-slate-900 transition-colors">Sign Up</a>
              <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">Contact</a>
            </div>
          </div>
          
          <div className="mt-8 border-t border-slate-100 pt-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs text-slate-500">
            <p className="max-w-2xl text-balance">
              <strong>Disclaimer:</strong> This tool generates AI-assisted content for educational and preparation purposes only. Output is not legal advice and must be reviewed by qualified compliance counsel before implementation.
            </p>
            <div className="flex flex-col items-start md:items-end gap-1">
              <p>&copy; {new Date().getFullYear()} CMS Compliance Suite. All rights reserved.</p>
              <nav className="flex flex-wrap justify-start gap-x-4 gap-y-1 md:justify-end" aria-label="Legal and support">
                <a href={TERMS_URL} className="hover:text-slate-900">Terms of Service</a>
                <a href={PRIVACY_URL} className="hover:text-slate-900">Privacy Policy</a>
                <a href={`${TERMS_URL}#billing`} className="hover:text-slate-900">Billing &amp; Cancellation</a>
                <a href="mailto:CMSComplianceGaurdian@outlook.com" className="hover:text-slate-900">Support</a>
              </nav>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
