import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface OnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function OnboardingDialog({ open, onOpenChange, onComplete }: OnboardingDialogProps) {
  const handleContinue = () => {
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome</DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-6 py-2">
          <p className="leading-relaxed">
            This project is a production-ready SaaS application template designed to give you a
            strong starting point for real-world products.
          </p>
          <div>
            <p className="font-semibold mb-3">It includes:</p>
            <ul className="space-y-2 ml-2">
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1.5">•</span>
                <span>Authentication (WorkOS)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1.5">•</span>
                <span>Multi-tenant workspaces and organization managment</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1.5">•</span>
                <span>Sample components like forms, tables, and modals</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-muted-foreground mt-1.5">•</span>
                <span>Clean patterns for queries, mutations, and error handling</span>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="leading-relaxed">Have fun building your next SaaS application!</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
