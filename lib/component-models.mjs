// Suggested reference models are not purchase SKUs. A staff member must confirm
// vendor, exact variant, electrical compatibility, stock, and landed cost.
export const componentModels = {
  c3: { model: 'Espressif ESP32-C3-DevKitM-1', source: 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32c3/esp32-c3-devkitm-1/user_guide.html', status: '参考型号' },
  s3: { model: 'Espressif ESP32-S3-DevKitC-1-N8R8', source: 'https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/index.html', status: '参考型号' },
  oled: { model: 'SSD1306 · 0.96 英寸 128×64 I²C OLED 模块', status: '模块供应商待确认' },
  touch: { model: 'TTP223B 单通道电容触摸模块', status: '模块供应商待确认' },
  buzzer: { model: 'KY-012 5 V 有源蜂鸣器模块', status: '工作电压与驱动方式待核验' },
  imu: { model: 'GY-521 / MPU-6050 六轴模块', status: '模块供应商待确认' },
  rgb: { model: 'WS2812B 单灯 RGB 模块', status: '供电与数据电平待核验' },
  soil: { model: '电容式土壤湿度传感器 v1.2', status: '模块版本与防水性待核验' },
  lcd: { model: 'ST7789 · 1.54 英寸 240×240 SPI 彩屏模块', status: '排线与供电待核验' },
  buttons: { model: '6×6 mm 轻触按键 × 4 + 确认键 × 1', status: '布局与外壳待打样' },
  camera: { model: 'OV2640 DVP 摄像头模块', status: '引脚与主控兼容性待核验' },
  ultrasonic: { model: 'HC-SR04 超声波测距模块', status: '5 V Echo 电平转换待设计' },
  motors: { model: 'N20 6 V 直流减速电机双轮套件', status: '转速与轮径待确认' },
  driver: { model: 'DRV8833 双路直流电机驱动模块', source: 'https://www.ti.com/product/DRV8833', status: '模块供应商待确认' },
  usb: { model: 'USB-A 转 Micro-B 供电线 · 1 m', status: '接口需与主控版本核对' },
  wires: { model: '2.54 mm 杜邦连接线 · 20 cm 混合装', status: '接头组合待按接线图确认' },
  petShell: { model: '桌宠定制外壳 · 尺寸待打样', status: '无现成采购型号' },
  wandShell: { model: '魔法棒定制外壳 · 尺寸待打样', status: '无现成采购型号' },
  potShell: { model: '花盆支架 · 尺寸待打样', status: '无现成采购型号' },
  gameShell: { model: '掌机定制外壳 · 尺寸待打样', status: '无现成采购型号' },
  glassesShell: { model: '眼镜概念支架 · 尺寸待打样', status: '无现成采购型号' },
  chassis: { model: 'N20 双轮机器人底盘套件', status: '与电机安装孔位待核验' },
};

export function modelFor(id) {
  return componentModels[id] || { model: '型号待确认', status: '采购待确认' };
}
