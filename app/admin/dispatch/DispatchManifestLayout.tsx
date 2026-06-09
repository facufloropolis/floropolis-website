'use client';
// 3-panel layout shell for the daily dispatch manifest (mockup parity).
// v1 | 2026-06-09 | Job_PM dispatch-mockup-rebuild
//
// Holds the cross-panel state (sample-box modal open/close) and composes the
// three panels + modal. All data is passed in from the server page.

import { useState } from 'react';
import {
  TodayDispatchPanel,
  CommunicationsPanel,
  LabelsPanel,
  SampleBoxModal,
  type SampleProspect,
} from './DispatchManifestPanels';
import type {
  ManifestBox,
  ManifestFarm,
  ManifestEmail,
  ClientNotification,
} from './DispatchManifestData';

export default function DispatchManifestLayout({
  boxes,
  farms,
  farmEmails,
  clientNotifications,
  yesterday,
  totalBoxes,
  farmCount,
  belowMinimum,
  prospects,
  dispatchDate,
}: {
  boxes: ManifestBox[];
  farms: ManifestFarm[];
  farmEmails: ManifestEmail[];
  clientNotifications: ClientNotification[];
  yesterday: ManifestBox[];
  totalBoxes: number;
  farmCount: number;
  belowMinimum: boolean;
  prospects: SampleProspect[];
  dispatchDate: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="grid lg:grid-cols-3 gap-5">
        <TodayDispatchPanel
          boxes={boxes}
          farms={farms}
          belowMinimum={belowMinimum}
          onOpenSampleBox={() => setModalOpen(true)}
        />
        <CommunicationsPanel
          farmEmails={farmEmails}
          clientNotifications={clientNotifications}
          yesterday={yesterday}
          totalBoxes={totalBoxes}
          farmCount={farmCount}
        />
        <LabelsPanel boxes={boxes} totalBoxes={totalBoxes} dispatchDate={dispatchDate} />
      </div>
      <SampleBoxModal open={modalOpen} prospects={prospects} onClose={() => setModalOpen(false)} />
    </>
  );
}
