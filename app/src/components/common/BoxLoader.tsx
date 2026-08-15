import React from 'react';

interface BoxLoaderProps {
  className?: string;
}

export const BoxLoader: React.FC<BoxLoaderProps> = ({ className }) => (
  <div className={`box-loader ${className ?? ''}`} aria-hidden="true">
    <div className="box-loader__box box-loader__box1" />
    <div className="box-loader__box box-loader__box2" />
    <div className="box-loader__box box-loader__box3" />
  </div>
);
