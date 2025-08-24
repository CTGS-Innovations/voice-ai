# VoIP.ms SIP Server List

Complete list of VoIP.ms SIP servers with IP addresses for Jambonz configuration.

## Server List by Location

### Atlanta
- Atlanta 1, GA (atlanta1.voip.ms) 208.100.60.17
- Atlanta 2, GA (atlanta2.voip.ms) 208.100.60.18

### Chicago
- Chicago, IL (chicago1.voip.ms) 208.100.60.8
- Chicago 2, IL (chicago2.voip.ms) 208.100.60.9
- Chicago 3, IL (chicago3.voip.ms) 208.100.60.10
- Chicago 4, IL (chicago4.voip.ms) 208.100.60.6

### Dallas
- Dallas 1, TX (dallas1.voip.ms) 208.100.60.29
- Dallas2,TX (dallas2.voip.ms) 208.100.60.30

### Denver
- Denver 1, CO (denver1.voip.ms) 208.100.60.32
- Denver 2, CO (denver2.voip.ms) 208.100.60.33

### Houston
- Houston 1, TX (houston1.voip.ms) 208.100.60.15
- Houston 2, TX (houston2.voip.ms) 208.100.60.16

### Los Angeles
- Los Angeles 1, CA (losangeles1.voip.ms) 208.100.60.35
- Los Angeles 2, CA (losangeles2.voip.ms) 208.100.60.36
- Los Angeles 3, CA (losangeles3.voip.ms) 208.100.60.37
- Los Angeles 4, CA (losangeles4.voip.ms) 208.100.60.38

### New York
- New York 1, NY (newyork1.voip.ms) 208.100.60.66
- New York 2, NY (newyork2.voip.ms) 208.100.60.67
- New York 3, NY (newyork3.voip.ms) 208.100.60.68
- New York 4, NY (newyork4.voip.ms) 208.100.60.69
- New York 5, NY (newyork5.voip.ms) 208.100.60.11
- New York 6, NY (newyork6.voip.ms) 208.100.60.12
- New York 7, NY (newyork7.voip.ms) 208.100.60.13
- New York 8, NY (newyork8.voip.ms) 208.100.60.14

### San Jose
- San Jose 1, CA (sanjose1.voip.ms) 208.100.60.40
- San Jose 2, CA (sanjose2.voip.ms) 208.100.60.41

### Seattle
- Seattle 1, WA (seattle1.voip.ms) 208.100.60.42
- Seattle 2, WA (seattle2.voip.ms) 208.100.60.43
- Seattle 3, WA (seattle3.voip.ms) 208.100.60.44

### Tampa
- Tampa 1, FL (tampa1.voip.ms) 208.100.60.46
- Tampa 2, FL (tampa2.voip.ms) 208.100.60.47
- Tampa 3, FL (tampa3.voip.ms) 208.100.60.48
- Tampa 4, FL (tampa4.voip.ms) 208.100.60.49

### Washington DC
- Washington, DC (washington1.voip.ms) 208.100.60.63
- Washington 2, DC (washington2.voip.ms) 208.100.60.64

### Special Services
- Fax Server 1 (fax1.voip.ms) 208.100.60.81
- Fax Server 2 (fax2.voip.ms) 208.100.60.82

## Configuration Notes

- All servers use port 5060 for SIP
- Protocol: UDP (primary)
- Used for both inbound and outbound calls
- Configure multiple servers for redundancy
- Geographic proximity may improve latency

## Jambonz Usage

For optimal performance, configure multiple geographically diverse servers as SIP gateways:
- Primary: East Coast (New York/Atlanta)
- Secondary: Central (Chicago/Dallas) 
- Backup: West Coast (Los Angeles/Seattle)