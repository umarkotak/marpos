import { Languages, ChevronDown } from "lucide-react";
import { t, useI18n, setLanguage } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSelect({ standalone = false }) {
  const locale = useI18n();
  return (
    <div
      className={standalone ? "language-select standalone" : "language-select"}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("choose_language")}
              title={t("choose_language")}
            />
          }
        >
          <Languages size={16} />
          <span>{locale === "id" ? "ID" : "EN"}</span>
          <ChevronDown size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            onClick={() => setLanguage("en")}
            lang="en"
            aria-current={locale === "en" ? "true" : undefined}
          >
            {t("english")} {locale === "en" && "✓"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setLanguage("id")}
            lang="id"
            aria-current={locale === "id" ? "true" : undefined}
          >
            {t("indonesian")} {locale === "id" && "✓"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
