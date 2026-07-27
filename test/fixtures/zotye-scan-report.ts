// Sanitized fixture based on a real production validation case: a LAUNCH
// X431 "Vehicle Diagnostic Report" for a 2017 ZOTYE Domy X7 with 66 DTCs
// across 12 abnormal systems plus 2 systems reported OK. The real VIN is
// replaced with a deterministic test VIN (structurally valid, no real
// vehicle identity) — see docs/ZOTYE_SCAN_REGRESSION_QA.md. Structure,
// wording, module names, DTC codes, and statuses are preserved verbatim
// from the source report because the parser fix this validates is
// specifically about correctly reading THIS format.
export const ZOTYE_TEST_VIN = "Z0TYED0MYX7TEST01";

export const ZOTYE_SCAN_REPORT_TEXT = `Vehicle Diagnostic Report
The Report is created by
Pre-Repair
Vehicle Information
Year:2017
Make:ZOTYE
Model:Domy X7
VIN:${ZOTYE_TEST_VIN}
Vehicle Software Version:V18.21
Diagnostic Application Version:V7.00.012
Diagnostic path:Automatically Search Car Model > Domy Series > Domy X7 > Health Report
Repair Shop
Shop Name:d1
Address:
Zip Code:
Telephone:
Email:
SN:988774017600
Test Time:2026-07-25 15:12:47
System fault code 【Pre-Repair】
The following systems is abnormal:
1.8T Engine System
DTC (5)
1.P000B 'B' Camshaft Position Slow Response Generic Type DTC,reference Only
2.P000A Camshaft Control Slow Response(Inlet) Current
3.P0303 Cylinder 3 Misfire Detected History
4.P0300 Random/Multiple Cylinder Misfire Detected History
5.P0015 'B' Camshaft Position - Timing Over-Retarded Generic Type DTC,reference Only
Automatic Transmission System
DTC (14)
1.P184481 Engine Torque Signal Fault(Network Fault) History
2.P081107 Clutch Slip History
3.U121183 ESP (Electronic Stability Program) 4 Check Failure Generic Type DTC,reference Only
4.U11A383 GSM Check Failed History
5.U131183 ABS (Anti-lock Brake System) 1 Frame Lost Generic Type DTC,reference Only
6.U000188 CAN Busoff History
7.U11A387 GSM Frame Lost History
8.U121187 ESP3 Frame Lost History
9.U121387 ESP4 Frame Lost History
10.U12EA87 ABS2 Frame Lost History
11.U131187 ABS1 Frame Lost History
12.U139287 BCM Frame Lost History
13.U143187 ICU Frame Lost History
14.U158B87 PEPS Frame Lost History
Continental Electronic Stability Program
DTC (6)
1.U015500 Lost Communication With ICU(ICU) History
2.C120700 DDS+ Warning History
3.B111716 Battery Low Voltage Generic Type DTC,reference Only
4.U041781 Communication Signal Error(EPB) History
5.C110C00 CAN1CPP Message Timeout(ESC Only) History
6.C005196 SAS Sensor Faulty(Interior) History
Supplemental Restraint System(SRS)
DTC (4)
1.B1011FF Communication With Driver Seatbelt Buckle Switch Error History
2.B1012FF Communication With Front Passenger Seatbelt Buckle Switch Error History
3.B1054FF FR Airbag Resistance High Current
4.B1086FF Battery Voltage Low History
Front Body Control Module (FBCM)
DTC (3)
1.B102413 Brake Lamp Circuit Open History
2.U012487 PEPS (Passive Entry & Passive Start) Node Missing History
3.U015587 IC_Timeout History
Rear Body Control Module (RBCM)
DTC (2)
1.B100213 PDM_OutPu_Door Lamp_LED Open History
2.U015587 ICU Node Message Lost History
Instrument Cluster (ICU)
DTC (7)
1.U0100FF Lost Communication With EMS Current
2.U0101FF Lost Communication With TCU Current
3.U0121FF Lost Communication With ABS Current
4.U0128FF Lost Communication With EPB Current
5.U0129FF Lost Communication With ESP Current
6.U0131FF Lost Comunication With ESP Current
7.U0236FF Lost Communication With PEPS Current
Passive Entry And Passive Start(PEPS)
DTC (1)
1.B131888 CAN Bus Off Fault History
Electric Power Steering (EPS)
DTC (4)
1.C110921 IGN Signal Error History
2.U010000 EMS3 Lost Communication With EMS History
3.U012100 Lost Communication With Anti-lock Brake System (ABS) Control Module History
4.U041800 Invalid Data Received From Anti-lock Brake System (ABS) Control Module History
A/C System (AC)
DTC (3)
1.U012100 ABS/ESP Controller Signals - Lost Communication History
2.U013100 ICU Lost History
3.B170371 Mode Damper Motor History
Gateway System (GW)
DTC (14)
1.B111716 Battery Low Voltage Generic Type DTC,reference Only
2.U010000 C-CAN Network: Lostcommunication With EMS Generic Type DTC,reference Only
3.U010100 CAN Bus TCU Node Signal Missing. Generic Type DTC,reference Only
4.U012100 ABS (Anti-lock Brake System)/ESP (Electronic Stability Program) Node Missing Generic Type DTC,reference Only
5.U013100 Can Not Receive CCM Message Generic Type DTC,reference Only
6.U012600 CAN Bus SAS Node Signal Missing. Generic Type DTC,reference Only
7.U012800 Communication With EPB Interrupted Generic Type DTC,reference Only
8.U012200 Communication With GSM Interrupted Generic Type DTC,reference Only
9.U021400 Communication With PEPS CAN Timeout Generic Type DTC,reference Only
10.U120000 C-CAN Network: Lostcommunication With SRS Generic Type DTC,reference Only
11.U015500 Cluster CAN Message Timeout Generic Type DTC,reference Only
12.U016900 ALS Node Lost (Timeout 5000ms) Generic Type DTC,reference Only
13.U016400 AC Node Lost (Timeout 1000ms) Generic Type DTC,reference Only
14.U016C00 CCP Node Lost Generic Type DTC,reference Only
Body Control System(SBCM)
DTC (3)
1.B1024FF Boot Lid Circuit History
2.U012487 PEPS (Passive Entry & Passive Start) Node Missing Generic Type DTC,reference Only
3.U015587 ICU CAN Message Timeout Generic Type DTC,reference Only
The following systems are OK:
1.Electric Parking Brake System(EPB)
2.Steering Wheel Angle Sensor(SAS)
Disclaimer
This test report is for reference only for vehicle test and maintenance. The vehicle operating data
provided in this report are all static data. The detailed dynamic diagnostic data can be read by
professional maintenance device, and LAUNCH will not be liable for any accidents and failures arising
therefrom!`;

export const ZOTYE_EXPECTED_SYSTEM_COUNTS: Record<string, number> = {
  "1.8T Engine System": 5,
  "Automatic Transmission System": 14,
  "Continental Electronic Stability Program": 6,
  "Supplemental Restraint System(SRS)": 4,
  "Front Body Control Module (FBCM)": 3,
  "Rear Body Control Module (RBCM)": 2,
  "Instrument Cluster (ICU)": 7,
  "Passive Entry And Passive Start(PEPS)": 1,
  "Electric Power Steering (EPS)": 4,
  "A/C System (AC)": 3,
  "Gateway System (GW)": 14,
  "Body Control System(SBCM)": 3,
};

export const ZOTYE_TOTAL_DTC_COUNT = Object.values(ZOTYE_EXPECTED_SYSTEM_COUNTS).reduce((a, b) => a + b, 0);
