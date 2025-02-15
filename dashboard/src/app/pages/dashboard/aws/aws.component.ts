import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { AwsService } from '../../../services/aws.service';
import { StoreService } from '../../../services/store.service';
import { SettingsService } from '../../../services/settings.service';
import { Subject, Subscription } from 'rxjs';
import * as Chartist from 'chartist';
import 'chartist-plugin-tooltips';
import 'jquery-mapael';
import 'jquery-mapael/js/maps/world_countries.js';
import * as $ from 'jquery';
declare var Chart: any;
import { NgbModal, ModalDismissReasons } from '@ng-bootstrap/ng-bootstrap';

@Component({
    selector: 'aws-dashboard',
    templateUrl: './aws.component.html',
    styleUrls: ['./aws.component.css'],
})
export class AwsDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
    public iamUsers: number = 0;
    public currentBill: number = 0;
    public usedRegions: number = 0;
    public redAlarms: number = 0;
    public mostUsedServices: Array<any> = [];
    public openTickets: number = 0;
    public resolvedTickets: number = 0;
    public forecastBill: string = '0';

    public loadingCurrentBill: boolean = true;
    public loadingIamUsers: boolean = true;
    public loadingUsedRegions: boolean = true;
    public loadingRedAlarms: boolean = true;
    public loadingOpenTickets: boolean = true;
    public loadingResolvedTickets: boolean = true;
    public loadingCostHistoryChart: boolean = true;
    public loadingForecastBill: boolean = true;
    public alertConfigured: boolean = false;

    public slackConfig: any = {};

    public colors = ['#36A2EB', '#4BBFC0', '#FBAD4B', '#9368E9'];

    private regions = {
        us_east_1: {
            latitude: 39.020812,
            longitude: -77.433357,
        },
        us_east_2: {
            latitude: 40.4172871,
            longitude: -82.907123,
        },
        us_west_1: {
            latitude: 36.778261,
            longitude: -119.4179324,
        },
        us_west_2: {
            latitude: 43.8041334,
            longitude: -120.5542012,
        },
        ca_central_1: {
            latitude: 51.253775,
            longitude: -85.323214,
        },
        eu_central_1: {
            latitude: 50.1109221,
            longitude: 8.6821267,
        },
        eu_west_1: {
            latitude: 53.4058314,
            longitude: -6.0624418,
        },
        eu_west_2: {
            latitude: 51.5073509,
            longitude: -0.1277583,
        },
        eu_west_3: {
            latitude: 48.856614,
            longitude: 2.3522219,
        },
        eu_north_1: {
            latitude: 59.334591,
            longitude: 18.06324,
        },
        ap_northeast_1: {
            latitude: 35.6894875,
            longitude: 139.6917064,
        },
        ap_northeast_2: {
            latitude: 37.566535,
            longitude: 126.9779692,
        },
        ap_northeast_3: {
            latitude: 34.6937378,
            longitude: 135.5021651,
        },
        ap_southeast_1: {
            latitude: 1.3553794,
            longitude: 103.8677444,
        },
        ap_southeast_2: {
            latitude: -33.8688197,
            longitude: 151.2092955,
        },
        ap_south_1: {
            latitude: 19.0759837,
            longitude: 72.8776559,
        },
        sa_east_1: {
            latitude: -23.5505199,
            longitude: -46.6333094,
        },
    };

    private _subscription: Subscription;

    constructor(
        private AwsService: AwsService,
        private storeService: StoreService,
        private modalService: NgbModal,
        private settingsService: SettingsService
    ) {}

    ngOnDestroy() {
        this._subscription.unsubscribe();
    }

    open(content) {
        this.modalService.open(content, {
            ariaLabelledBy: 'modal-basic-title',
        });
    }

    private initState() {
        this.mostUsedServices = [];

        this.settingsService.getIntegrations().subscribe(
            (data) => {
                this.alertConfigured = data['slack'];
            },
            (err) => {
                this.alertConfigured = false;
            }
        );

        this.AwsService.getIAMUsers().subscribe(
            (data) => {
                this.iamUsers = data;
                this.loadingIamUsers = false;
            },
            (err) => {
                this.iamUsers = 0;
                this.loadingIamUsers = false;
            }
        );

        this.AwsService.getCurrentCost().subscribe(
            (data) => {
                this.currentBill = data.toFixed(2);
                this.loadingCurrentBill = false;
            },
            (err) => {
                this.currentBill = 0;
                this.loadingCurrentBill = false;
            }
        );

        this.AwsService.getCostAndUsage().subscribe(
            (data) => {
                data[data.length - 1].groups.slice(0, 4).forEach((service) => {
                    this.mostUsedServices.push({
                        name: service.key,
                        cost: service.amount,
                    });
                });

                let periods = [];
                let series = [];
                data.forEach((period) => {
                    periods.push(
                        new Date(period.start).toLocaleString('en-us', {
                            month: 'long',
                        })
                    );
                });

                for (let i = 0; i < periods.length; i++) {
                    let serie = [];
                    for (let j = 0; j < periods.length; j++) {
                        let item = data[j].groups[i];
                        serie.push({
                            meta: item.key,
                            value: item.amount.toFixed(2),
                        });
                    }
                    series.push(serie);
                }

                this.loadingCostHistoryChart = false;
                this.showLastSixMonth(periods, series);
            },
            (err) => {
                this.loadingCostHistoryChart = false;
            }
        );

        this.AwsService.getInstancesPerRegion().subscribe(
            (data) => {
                let plots = {};
                Object.keys(data.region).forEach((key) => {
                    let params = this.regions[key.split('-').join('_')];
                    plots[key] = {
                        latitude: params.latitude,
                        longitude: params.longitude,
                        value: [data.region[key], 1],
                        tooltip: {
                            content: `${key}<br />Instances: ${data.region[key]}`,
                        },
                    };
                });
                this.showEC2InstancesPerRegion(plots);
            },
            (err) => {}
        );

        this.AwsService.getUsedRegions().subscribe(
            (data) => {
                this.usedRegions = data.length;
                this.loadingUsedRegions = false;
            },
            (err) => {
                this.usedRegions = 0;
                this.loadingUsedRegions = false;
            }
        );

        this.AwsService.getCloudwatchAlarms().subscribe(
            (data) => {
                this.redAlarms = data.ALARM ? data.ALARM : 0;
                this.loadingRedAlarms = false;
            },
            (err) => {
                this.usedRegions = 0;
                this.loadingRedAlarms = false;
            }
        );

        this.AwsService.getOpenSupportTickets().subscribe(
            (data) => {
                this.openTickets = data.length;
                this.loadingOpenTickets = false;
            },
            (err) => {
                this.openTickets = 0;
                this.loadingOpenTickets = false;
            }
        );

        this.AwsService.getSupportTicketsHistory().subscribe(
            (data) => {
                data.forEach((ticket) => {
                    if (ticket.status == 'resolved') {
                        this.resolvedTickets++;
                    }
                });
                this.loadingResolvedTickets = false;
            },
            (err) => {
                this.resolvedTickets = 0;
                this.loadingResolvedTickets = false;
            }
        );

        this.AwsService.getForecastPrice().subscribe(
            (data) => {
                this.forecastBill = this.formatNumber(data).toString();
                this.loadingForecastBill = false;
            },
            (err) => {
                this.forecastBill = '0';
                this.loadingForecastBill = false;
            }
        );
    }

    public configureSlack() {
        this.settingsService.setupSlackIntegration(this.slackConfig).subscribe(
            (data) => {
                this.alertConfigured = true;
                this.slackConfig = {
                    token: '',
                    channel: '',
                    handler: 'slack',
                };
                this.modalService.dismissAll();
            },
            (err) => {
                this.slackConfig = {
                    token: '',
                    channel: '',
                    handler: 'slack',
                };
                this.modalService.dismissAll();
            }
        );
    }
    ngOnInit() {
        this.slackConfig = {
            token: '',
            channel: '',
            handler: 'slack',
        };
    }

    ngAfterViewInit(): void {
        this.showEC2InstancesPerRegion({});

        this.initState();

        this._subscription = this.storeService.profileChanged.subscribe(
            (profile) => {
                this.iamUsers = 0;
                this.currentBill = 0;
                this.usedRegions = 0;
                this.redAlarms = 0;
                this.mostUsedServices = [];
                this.openTickets = 0;
                this.resolvedTickets = 0;
                this.forecastBill = '0';

                this.loadingCurrentBill = true;
                this.loadingIamUsers = true;
                this.loadingUsedRegions = true;
                this.loadingRedAlarms = true;
                this.loadingOpenTickets = true;
                this.loadingResolvedTickets = true;
                this.loadingCostHistoryChart = true;
                this.loadingForecastBill = true;

                this.initState();
            }
        );
    }

    public formatNumber(labelValue) {
        // Nine Zeroes for Billions
        return Math.abs(Number(labelValue)) >= 1.0e9
            ? (Math.abs(Number(labelValue)) / 1.0e9).toFixed(2) + ' B'
            : // Six Zeroes for Millions
            Math.abs(Number(labelValue)) >= 1.0e6
            ? (Math.abs(Number(labelValue)) / 1.0e6).toFixed(2) + ' M'
            : // Three Zeroes for Thousands
            Math.abs(Number(labelValue)) >= 1.0e3
            ? (Math.abs(Number(labelValue)) / 1.0e3).toFixed(2) + ' K'
            : Math.abs(Number(labelValue)).toFixed(2);
    }

    public showEC2InstancesPerRegion(plots) {
        var canvas: any = $('.mapregions');
        canvas.mapael({
            map: {
                name: 'world_countries',
                zoom: {
                    enabled: true,
                    maxLevel: 10,
                },
                defaultPlot: {
                    attrs: {
                        fill: '#004a9b',
                        opacity: 0.6,
                    },
                },
                defaultArea: {
                    attrs: {
                        fill: '#e4e4e4',
                        stroke: '#fafafa',
                    },
                    attrsHover: {
                        fill: '#FBAD4B',
                    },
                    text: {
                        attrs: {
                            fill: '#505444',
                        },
                        attrsHover: {
                            fill: '#000',
                        },
                    },
                },
            },
            legend: {
                plot: [
                    {
                        labelAttrs: {
                            fill: '#f4f4e8',
                        },
                        titleAttrs: {
                            fill: '#f4f4e8',
                        },
                        cssClass: 'density',
                        mode: 'horizontal',
                        title: 'Density',
                        marginBottomTitle: 5,
                        slices: [
                            {
                                label: '< 1',
                                max: '0',
                                attrs: {
                                    fill: '#36A2EB',
                                },
                                legendSpecificAttrs: {
                                    r: 25,
                                },
                            },
                            {
                                label: '> 1',
                                min: '1',
                                max: '50000',
                                attrs: {
                                    fill: '#87CB14',
                                },
                                legendSpecificAttrs: {
                                    r: 25,
                                },
                            },
                        ],
                    },
                ],
            },
            plots: plots,
        });
    }

    public showLastSixMonth(labels, series) {
        let scope = this;
        var costHistory = {
            labels: labels,
            series: series,
        };

        var optionChartCostHistory = {
            plugins: [Chartist.plugins.tooltip()],
            seriesBarDistance: 10,
            axisX: {
                showGrid: false,
            },
            axisY: {
                offset: 80,
                labelInterpolationFnc: function (value) {
                    return scope.formatNumber(value);
                },
            },
            height: '245px',
        };

        new Chartist.Bar(
            '#costHistoryChart',
            costHistory,
            optionChartCostHistory
        );
    }
}
