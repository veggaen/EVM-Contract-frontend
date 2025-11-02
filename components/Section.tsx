"use client";

import React from "react";
import { motion } from "framer-motion";

interface SectionProps {
  title: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  containerClassName?: string; // extra classes on glass container
  contentClassName?: string;   // extra classes on inner motion div
}

export default function Section({
  title,
  ariaLabel,
  icon,
  id,
  children,
  headerRight,
  containerClassName = "",
  contentClassName = "",
}: SectionProps) {
  return (
    <div role="region" aria-label={ariaLabel ?? title} id={id} className="w-full">
      <div className={`glass w-full p-4 sm:p-6 lg:p-8 ring-white/10 space-y-8 ${containerClassName}`}>
        <motion.div
          className={`${contentClassName}`}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center pt-6 mt-6 border-t border-white/10" style={{ color: "var(--primary)" }}>
              {icon ? <span className="mr-2">{icon}</span> : null}
              {title}
            </h2>
            {headerRight ? <div className="ml-4">{headerRight}</div> : null}
          </div>
          {children}
        </motion.div>
      </div>
    </div>
  );
}

