'use client';

import { Button } from '@/components/ui/button';

import { useMediaQuery } from '@/hooks/use-media-query';
import { useSyncedPreferences } from '@/hooks/use-synced-preferences';

import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { ExtensionSlot } from '@/components/extension-slot';

import { SKILL_CATALOG } from '@/lib/skills/catalog';

// Custom visx-based chart components

export function SkillsSection() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [disabledSkills, setDisabledSkills] = useSyncedPreferences<string[]>('zetora-disabled-skills', []);
  const allSkills = SKILL_CATALOG;
  const enabledCount = allSkills.length - disabledSkills.filter((id) => allSkills.some((s) => s.id === id)).length;

  const toggleSkill = (skillId: string, enabled: boolean) => {
    if (enabled) {
      setDisabledSkills(disabledSkills.filter((id) => id !== skillId));
    } else {
      setDisabledSkills([...disabledSkills, skillId]);
    }
  };

  const sections: Array<{ key: 'core' | 'other'; label: string }> = [
    { key: 'core', label: 'Core' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <div className={cn(isMobile ? 'space-y-4' : 'space-y-5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-pixel-grid text-xs text-muted-foreground/50">01</span>
          <h3 className={cn('font-semibold', isMobile ? 'text-sm' : 'text-base')}>Skills</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground/60">
            {enabledCount}/{allSkills.length} enabled
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-md"
            onClick={() => setDisabledSkills([])}
          >
            All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 rounded-md"
            onClick={() => setDisabledSkills(allSkills.map((s) => s.id))}
          >
            None
          </Button>
        </div>
      </div>

      <div>
        <h4 className={cn('font-medium', isMobile ? 'text-[13px]' : 'text-sm')}>Skill Directory</h4>
        <p className={cn('text-muted-foreground mt-1', isMobile ? 'text-[11px] leading-relaxed' : 'text-xs')}>
          Skills are playbooks that guide the AI through complex tasks. Enable the ones you want active in your
          chats.
        </p>
      </div>

      {sections.map(({ key, label }) => {
        const skillsInSection = allSkills.filter((s) => s.section === key);
        if (skillsInSection.length === 0) return null;
        return (
          <div key={key} className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">{label}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {skillsInSection.map((skill) => {
                const isEnabled = !disabledSkills.includes(skill.id);
                return (
                  <div key={skill.id} className="border border-border/60 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h5 className={cn('font-medium truncate', isMobile ? 'text-[13px]' : 'text-sm')}>
                          {skill.name}
                        </h5>
                        <span className="font-pixel text-[10px] text-muted-foreground/50 uppercase tracking-wider">
                          {skill.category}
                        </span>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => toggleSkill(skill.id, checked)}
                        className="shrink-0"
                      />
                    </div>
                    <p className={cn('text-muted-foreground leading-relaxed', isMobile ? 'text-[11px]' : 'text-xs')}>
                      {skill.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-muted-foreground/50 text-center pt-1">
        Changes sync automatically and take effect on your next message.
      </p>

      {/* An extension may render its own additional skills tier here (e.g.
          the agent overlay's custom / agent-authored SKILL.md skills, C5) —
          nothing renders when no overlay is checked out. */}
      <ExtensionSlot name="settings-skills-extra" />
    </div>
  );
}

